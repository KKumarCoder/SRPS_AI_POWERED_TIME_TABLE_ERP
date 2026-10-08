using System;
using System.Configuration;
using System.IO;
using System.Net;
namespace Srps.Bridge {
 sealed class Config {
  public static string Get(string key) { return Environment.GetEnvironmentVariable(key) ?? ConfigurationManager.AppSettings[key] ?? ""; }
  public static int Number(string key) { return int.Parse(Get(key)); }
  public readonly string Model=Get("DEVICE_MODEL"), ExpectedSerial=Get("DEVICE_SERIAL_EXPECTED"), DeviceIp=Get("DEVICE_IP"), BridgeId=Get("BRIDGE_ID"), Key=Get("ERP_BRIDGE_API_KEY");
  public readonly int Machine=Number("DEVICE_MACHINE_NUMBER"), Port=Number("DEVICE_PORT"), Password=Number("DEVICE_PASSWORD"), EventPort=Number("EVENT_PORT"), FallbackSeconds=Number("FALLBACK_SECONDS");
  public readonly string EventIp=Get("EVENT_SOURCE_IP");
  public readonly bool Mock=Get("ATTENDANCE_BRIDGE_MOCK")=="true", Diagnostics=Get("RAW_DIAGNOSTICS")=="true";
  public readonly string Directory=string.IsNullOrWhiteSpace(Get("DATA_DIRECTORY"))?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"SRPS","T304Bridge"):Path.GetFullPath(Get("DATA_DIRECTORY"));
  public readonly Uri Api;
  public Config() {
   Api=new Uri(Get("ERP_API_BASE_URL").TrimEnd('/')+"/");
   if(Api.Scheme!="https" && !(Get("BRIDGE_ENVIRONMENT")=="development" && Api.IsLoopback && Api.Scheme=="http"))throw new Exception("ERP API requires HTTPS; development HTTP is allowed only on loopback.");
   if(Key.Length<32)throw new Exception("Set ERP_BRIDGE_API_KEY to at least 32 characters.");
   if(Get("TIMEZONE")!="Asia/Kolkata")throw new Exception("Only Asia/Kolkata is supported.");
   if(Mock&&Get("BRIDGE_ENVIRONMENT")!="development")throw new Exception("Mock mode requires development environment.");
   IPAddress ip;
   if(!Mock&&(!IPAddress.TryParse(DeviceIp,out ip)||ip.AddressFamily!=System.Net.Sockets.AddressFamily.InterNetwork))throw new Exception("Device IP is not configured or invalid. Physical device connection test is pending.");
   if(!IPAddress.TryParse(EventIp,out ip)||ip.AddressFamily!=System.Net.Sockets.AddressFamily.InterNetwork)throw new Exception("EVENT_SOURCE_IP must be IPv4.");
   if(Port<1||Port>65535||EventPort<1||EventPort>65535||Machine<1||FallbackSeconds<30)throw new Exception("Invalid machine, port or fallback interval.");
   if(Model!="Realtime Pro T304 mini"||string.IsNullOrWhiteSpace(ExpectedSerial)||string.IsNullOrWhiteSpace(BridgeId))throw new Exception("Invalid device identity configuration.");
  }
 }
}
