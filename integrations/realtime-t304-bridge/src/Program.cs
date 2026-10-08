using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
namespace Srps.Bridge {
 sealed class Runner {
  readonly CancellationTokenSource stop=new CancellationTokenSource(); Task task;
  public void Start(string[] args) {new Config();task=Task.Run(()=>Run(args,stop.Token));task.ContinueWith(t=>Environment.Exit(1),TaskContinuationOptions.OnlyOnFaulted);}
  public void Stop() {stop.Cancel();if(task!=null&&!task.Wait(TimeSpan.FromSeconds(25)))throw new TimeoutException("Bridge shutdown timed out; inspect SDK/network state.");}
  public static async Task Run(string[] args,CancellationToken token) {
   if(string.IsNullOrWhiteSpace(Config.Get("DEVICE_IP"))&&Config.Get("ATTENDANCE_BRIDGE_MOCK")!="true")throw new Exception("Device IP is not configured. Physical device connection test is pending.");
   var cfg=new Config();System.IO.Directory.CreateDirectory(cfg.Directory);
   // A filesystem lock prevents multiple service/console instances from racing on the same spool.
   using(var single=new System.IO.FileStream(System.IO.Path.Combine(cfg.Directory,"bridge.lock"),System.IO.FileMode.OpenOrCreate,System.IO.FileAccess.ReadWrite,System.IO.FileShare.None)) {
    var log=new Log(cfg.Directory);var spool=new Spool(cfg.Directory);log.Write("Bridge started"+(cfg.Mock?" in explicitly enabled MOCK mode":""));
    using(var device=new RealtimeDeviceService(cfg,log,spool))
    using(var client=new HttpClient(new HttpClientHandler {AllowAutoRedirect=false}) {Timeout=TimeSpan.FromSeconds(20),BaseAddress=cfg.Api}) {
     ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;client.DefaultRequestHeaders.Add("X-SRPS-Bridge-Key",cfg.Key);
     if(Array.IndexOf(args,"--diagnose")>=0&&!cfg.Mock){try{using(var ping=new Ping()){var reply=ping.Send(cfg.DeviceIp,2000);log.Write("Network ping: "+reply.Status);}}catch{log.Write("ICMP unavailable; TCP reachability will be tested.");}using(var tcp=new TcpClient()){var connect=tcp.ConnectAsync(cfg.DeviceIp,cfg.Port);if(await Task.WhenAny(connect,Task.Delay(3000,token))==connect){await connect;log.Write("TCP reachability success");}else log.Write("TCP reachability timed out");}}
     if(cfg.Mock){if(args.Length!=3||args[0]!="--simulate")throw new Exception("Mock mode usage: --simulate <deviceUserId> <ISO timestamp with offset>");DateTimeOffset parsed;if(!DateTimeOffset.TryParse(args[2],out parsed))throw new Exception("Invalid simulation timestamp");spool.Save(new Dictionary<string,object>{{"bridgeId",cfg.BridgeId},{"deviceModel",cfg.Model},{"deviceSerial",cfg.ExpectedSerial},{"machineNumber",cfg.Machine},{"eventType","Time Log"},{"deviceUserId",args[1]},{"method","FACE"},{"eventTimestamp",parsed.ToString("o")},{"receivedAt",DateTimeOffset.UtcNow.ToString("o")},{"source","SBXPC_REALTIME"},{"isMock",true},{"attendanceStatusRaw",Config.Get("MOCK_ATTENDANCE_STATUS")},{"verificationModeRaw",Config.Get("MOCK_VERIFICATION_MODE")}});}
     using(var linked=CancellationTokenSource.CreateLinkedTokenSource(token)) {
      var upload=Upload(client,spool,log,linked.Token);var heartbeat=Heartbeat(client,cfg,device,spool,log,linked.Token);
      try {
       int retry=5;DateTime nextSync=DateTime.MinValue;
       while(!token.IsCancellationRequested){
        if(cfg.Mock){await Task.Delay(1000,token);continue;}
        try {
         if(!device.Connected){device.Connect();device.StartRealtimeEvents();
          // Full replay on reconnect/start recovers records marked read before a process/disk failure.
          device.ReadAllAttendanceLogsForDiagnostics();retry=5;nextSync=DateTime.MinValue;
         }
         if(!device.HealthCheck())throw new Exception("Device health check failed");
         if(DateTime.UtcNow>=nextSync){device.ReadNewAttendanceLogs();nextSync=DateTime.UtcNow.AddSeconds(cfg.FallbackSeconds);}
         await Task.Delay(5000,token);
        }catch(OperationCanceledException){throw;}
        catch(Exception e){log.Write("SDK/device failure: "+SafeError(e)+". Reconnect in "+retry+" seconds.");try{device.Disconnect();}catch(Exception close){log.Write("Disconnect failed: "+SafeError(close));}await Task.Delay(retry*1000,token);retry=Math.Min(60,retry*2);}
       }
      }finally{linked.Cancel();try{await Task.WhenAll(upload,heartbeat);}catch(OperationCanceledException){}log.Write("Bridge shutdown; pending events retained.");}
     }
    }
   }
  }
  static string SafeError(Exception e){if(e is DllNotFoundException)return "SDK DLL or native dependency missing";if(e is BadImageFormatException)return "Native DLL architecture mismatch (x86 required)";return e is HttpRequestException?"Backend unavailable":e.GetType().Name+": "+e.Message;}
  static async Task<bool> Post(HttpClient client,string path,string json,CancellationToken token){using(var body=new StringContent(json,Encoding.UTF8,"application/json"))using(var response=await client.PostAsync(path,body,token)){if(!response.IsSuccessStatusCode)throw new Exception("Backend status "+(int)response.StatusCode+"; queued events retained");var text=await response.Content.ReadAsStringAsync();var parsed=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(text);if(parsed==null||!parsed.ContainsKey("success")||!Equals(parsed["success"],true))return false;if(path.EndsWith("/events")){object data;var obj=parsed.TryGetValue("data",out data)?data as Dictionary<string,object>:null;return obj!=null&&obj.ContainsKey("eventId")&&obj.ContainsKey("processingStatus");}return true;}}
  static async Task Upload(HttpClient client,Spool spool,Log log,CancellationToken token){int retry=1;while(!token.IsCancellationRequested){try{var file=spool.Oldest();if(file==null){await Task.Delay(1000,token);continue;}if(!await Post(client,"attendance/device/events",spool.Read(file),token))throw new Exception("API did not acknowledge event");spool.Ack(file);retry=1;log.Write("API upload success");}catch(OperationCanceledException){if(token.IsCancellationRequested)throw;log.Write("API timeout; retry scheduled");await Task.Delay(retry*1000,token);retry=Math.Min(120,retry*2);}catch(Exception e){log.Write("Upload failure: "+SafeError(e)+". Retry in "+retry+" seconds.");await Task.Delay(retry*1000,token);retry=Math.Min(120,retry*2);}}}
  static async Task Heartbeat(HttpClient client,Config cfg,RealtimeDeviceService device,Spool spool,Log log,CancellationToken token){while(!token.IsCancellationRequested){try{var payload=new {bridgeId=cfg.BridgeId,deviceModel=cfg.Model,deviceSerial=device.Serial,machineNumber=cfg.Machine,connected=device.Connected,deviceIp=cfg.DeviceIp,lastDeviceEventAt=device.LastEvent.HasValue?device.LastEvent.Value.ToString("o"):null,pendingQueueCount=spool.Count,bridgeVersion="1.0.0",timestamp=DateTimeOffset.UtcNow.ToString("o")};await Post(client,"attendance/device/heartbeat",new JavaScriptSerializer().Serialize(payload),token);}catch(OperationCanceledException){if(token.IsCancellationRequested)throw;log.Write("Heartbeat timeout");}catch(Exception e){log.Write("Heartbeat failed: "+SafeError(e));}await Task.Delay(30000,token);}}
 }
 sealed class BridgeService:ServiceBase {readonly Runner runner=new Runner();public BridgeService(){ServiceName="SRPST304Bridge";}protected override void OnStart(string[] args){runner.Start(args);}protected override void OnStop(){runner.Stop();}}
 static class Program {
  static int Main(string[] args){try{if(!Environment.UserInteractive){ServiceBase.Run(new BridgeService());return 0;}using(var stop=new CancellationTokenSource()){Console.CancelKeyPress+=(s,e)=>{e.Cancel=true;stop.Cancel();};try{Runner.Run(args,stop.Token).GetAwaiter().GetResult();}catch(OperationCanceledException){}}return 0;}catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
 }
}
