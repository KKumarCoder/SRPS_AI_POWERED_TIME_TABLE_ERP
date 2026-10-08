using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Threading;
using sbxpc;
namespace Srps.Bridge {
 sealed class RealtimeDeviceService : IDisposable {
  readonly Config cfg; readonly Log log; readonly Spool spool;
  readonly SBXPCDLL.EventCallback callback;
  public volatile bool Connected; public string Serial {get;private set;} public DateTimeOffset? LastEvent {get;private set;}
  bool capturing; volatile bool storageFault;
  public RealtimeDeviceService(Config cfg,Log log,Spool spool) {this.cfg=cfg;this.log=log;this.spool=spool;Serial=cfg.ExpectedSerial;callback=ReceiveEvent;}
  Exception Failure(string operation) { int code;bool found=SBXPCDLL.GetLastError(cfg.Machine,out code);return new Exception(operation+" failed; SDK error="+(found?code.ToString():"unavailable")); }
  public void Connect() {
   if(storageFault)throw new Exception("Local storage fault: repair disk/permissions and restart bridge; machine history must be recovered.");
   log.Write("Connecting to "+cfg.DeviceIp+":"+cfg.Port);
   SBXPCDLL.DotNET();
   if(!SBXPCDLL.ConnectTcpip(cfg.Machine,cfg.DeviceIp,cfg.Port,cfg.Password))throw Failure("ConnectTcpip");
   Connected=true;
   try {GetDeviceIdentity();log.Write("Connection success; model="+cfg.Model+" serial="+Serial+" machine="+cfg.Machine);}catch{Disconnect();throw;}
  }
  public void GetDeviceIdentity() {
   string serial;
   if(!SBXPCDLL.GetSerialNumber(cfg.Machine,out serial)||string.IsNullOrWhiteSpace(serial))throw Failure("GetSerialNumber (identity is required before upload)");
   Serial=serial.Trim();
   if(Serial!=cfg.ExpectedSerial)log.Write("WARNING: Connected biometric device serial does not match configured device.");
   string product;if(SBXPCDLL.GetProductCode(cfg.Machine,out product))log.Write("Product code="+product);else log.Write(Failure("GetProductCode").Message);
   // Information selectors are vendor/firmware-specific; explicitly configure for diagnostic tests.
   int selector;uint value;
   if(int.TryParse(Config.Get("DIAGNOSTIC_DEVICE_INFO_SELECTOR"),out selector)){if(SBXPCDLL.GetDeviceInfo(cfg.Machine,selector,out value))log.Write("Device info selector="+selector+" value="+value);else log.Write(Failure("GetDeviceInfo").Message);}
   if(int.TryParse(Config.Get("DIAGNOSTIC_DEVICE_STATUS_SELECTOR"),out selector)){if(SBXPCDLL.GetDeviceStatus(cfg.Machine,selector,out value))log.Write("Device status selector="+selector+" value="+value);else log.Write(Failure("GetDeviceStatus").Message);}
  }
  public bool HealthCheck() {string serial;return Connected&&!storageFault&&SBXPCDLL.GetSerialNumber(cfg.Machine,out serial)&&serial.Trim()==Serial;}
  public void StartRealtimeEvents() {
   if(capturing)return;
   var b=IPAddress.Parse(cfg.EventIp).GetAddressBytes();
   // Vendor util.pubIPAddrToLong uses this numeric conversion, including its signed adjustment.
   long numeric=((long)b[0]<<24)|((long)b[1]<<16)|((long)b[2]<<8)|b[3];if(numeric>int.MaxValue)numeric-=int.MaxValue;
   if(!SBXPCDLL.StartEventCapture(0,(int)numeric,cfg.EventPort,callback,IntPtr.Zero))throw Failure("StartEventCapture");
   capturing=true;log.Write("Event capture started on "+cfg.EventIp+":"+cfg.EventPort);
  }
  public void StopRealtimeEvents() {if(capturing){SBXPCDLL.StopEventCapture();capturing=false;log.Write("Event capture stopped");}}
  static string Field(string xml,string name) {string value;if(!SBXPCDLL.XML_ParseString(ref xml,name,out value))return "";return value??"";}
  static int Integer(string xml,string name) {return SBXPCDLL.XML_ParseInt(ref xml,name);}
  static DateTimeOffset Time(int y,int m,int d,int h,int min,int s) {return new DateTimeOffset(y,m,d,h,min,s,TimeSpan.FromMinutes(330));}
  Dictionary<string,object> Event(string user,DateTimeOffset at,string source) {return new Dictionary<string,object>{{"bridgeId",cfg.BridgeId},{"deviceModel",cfg.Model},{"deviceSerial",Serial},{"machineNumber",cfg.Machine},{"eventType","Time Log"},{"deviceUserId",user},{"method",source=="SBXPC_SYNC"?"UNVERIFIED":"FACE"},{"eventTimestamp",at.ToString("yyyy-MM-dd'T'HH:mm:sszzz",CultureInfo.InvariantCulture)},{"receivedAt",DateTimeOffset.UtcNow.ToString("o")},{"source",source},{"attendanceStatusRaw",""},{"verificationModeRaw",""},{"antipassStatusRaw",""}};}
  void Queue(Dictionary<string,object> e) {spool.Save(e);LastEvent=DateTimeOffset.Parse((string)e["eventTimestamp"],CultureInfo.InvariantCulture);log.Write("Time Log queued durably; source="+e["source"]);}
  void ReceiveEvent(string xml) {
   // Exceptions must never cross the native callback boundary. Disk failure requires operator recovery.
   try {
    
    if(!Connected){log.Write("Event received before device identity validation; recover from historical logs.");return;}
    string type=Field(xml,"EventType");
    if(type!="Time Log"){log.Write(type=="Verification Success"||type=="Verification Failure"?type+" (not an attendance record)":"Non-attendance notification received");return;}
    int machine=Integer(xml,"MachineID");if(machine!=cfg.Machine){log.Write("Rejected event from unexpected MachineID");return;}
    string user=Field(xml,"UserID");long numeric;
    if(!long.TryParse(user,out numeric)||numeric<0)throw new Exception("Invalid or missing UserID in event");
    var at=Time(Integer(xml,"Year"),Integer(xml,"Month"),Integer(xml,"Day"),Integer(xml,"Hour"),Integer(xml,"Minute"),Integer(xml,"Second"));
    var e=Event(numeric.ToString(CultureInfo.InvariantCulture),at,"SBXPC_REALTIME");e["attendanceStatusRaw"]=Field(xml,"AttendanceStatus");e["verificationModeRaw"]=Field(xml,"VerificationMode");e["antipassStatusRaw"]=Field(xml,"AntipassStatus");Queue(e);if(cfg.Diagnostics)log.Xml(xml);
   }catch(System.IO.IOException){storageFault=true;SafeLog("CRITICAL: local queue write failed. Repair storage and restart; recover machine history.");}
   catch(Exception e){SafeLog("Event parsing/storage failed: "+e.GetType().Name+"; inspect redacted diagnostics and recover device history.");}
  }
  void SafeLog(string message){try{log.Write(message);}catch{storageFault=true;}}
  public void ReadNewAttendanceLogs() {Read(false);}
  public void ReadAllAttendanceLogsForDiagnostics() {Read(true);}
  void Read(bool all) {
   if(!(all?SBXPCDLL.ReadAllGLogData(cfg.Machine):SBXPCDLL.ReadGeneralLogData(cfg.Machine,1)))throw Failure(all?"ReadAllGLogData":"ReadGeneralLogData");
   int terminal,user,enrollment,mode,y,m,d,h,min,s,count=0;
   while(true){bool found=all?SBXPCDLL.GetAllGLogData(cfg.Machine,out terminal,out user,out enrollment,out mode,out y,out m,out d,out h,out min,out s):SBXPCDLL.GetGeneralLogData(cfg.Machine,out terminal,out user,out enrollment,out mode,out y,out m,out d,out h,out min,out s);if(!found)break;
    var e=Event(user.ToString(CultureInfo.InvariantCulture),Time(y,m,d,h,min,s),"SBXPC_SYNC");e["verificationModeCodeRaw"]=mode;e["terminalMachineNumberRaw"]=terminal;e["enrollmentMachineNumberRaw"]=enrollment;Queue(e);count++;
   }
   log.Write((all?"Full":"Incremental")+" historical read complete: "+count+" records; device logs retained.");
  }
  public void Disconnect() {try{StopRealtimeEvents();}finally{if(Connected){SBXPCDLL.Disconnect(cfg.Machine);Connected=false;log.Write("Device disconnected");}}}
  public void Dispose() {Disconnect();}
 }
}
