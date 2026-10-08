using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using System.Xml;
using System.Xml.Linq;
namespace Srps.Bridge {
 sealed class Log {
  readonly string root; readonly object gate=new object();
  public Log(string root) { this.root=Path.Combine(root,"logs");Directory.CreateDirectory(this.root); }
  public void Write(string text) { lock(gate) { var path=Path.Combine(root,"bridge.log");if(File.Exists(path)&&new FileInfo(path).Length>5*1024*1024){for(int i=4;i>=1;i--){var older=path+"."+i;if(File.Exists(older)){if(i==4)File.Delete(older);else File.Move(older,path+"."+(i+1));}}File.Move(path,path+".1");}File.AppendAllText(path,DateTimeOffset.UtcNow.ToString("o")+" "+text+Environment.NewLine);Console.WriteLine(text); } }
  public void Xml(string raw) {
   // Fail closed: malformed XML is never persisted. Remove binary/image/template fields at any depth.
   try { using(var reader=XmlReader.Create(new StringReader(raw),new XmlReaderSettings { DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=8*1024*1024 })) {
    var doc=XDocument.Load(reader);string[] blocked={"photo","image","face","template","finger","binary","picture"};
    foreach(var e in doc.Descendants().Where(e=>blocked.Any(b=>e.Name.LocalName.IndexOf(b,StringComparison.OrdinalIgnoreCase)>=0)).ToList())e.ReplaceNodes("[REDACTED]");
    foreach(var a in doc.Descendants().Attributes().Where(a=>blocked.Any(b=>a.Name.LocalName.IndexOf(b,StringComparison.OrdinalIgnoreCase)>=0)).ToList())a.Value="[REDACTED]";
    Write("Diagnostic XML (biometric fields redacted): "+doc.ToString(SaveOptions.DisableFormatting));
   }} catch { Write("Diagnostic XML could not be safely parsed; raw content omitted."); }
  }
 }
 sealed class Spool {
  readonly string root; readonly object gate=new object();
  public Spool(string root) { this.root=Path.Combine(root,"queue");Directory.CreateDirectory(this.root);foreach(var f in Directory.GetFiles(this.root,"*.tmp")){var final=Path.ChangeExtension(f,".json");try{new JavaScriptSerializer().DeserializeObject(File.ReadAllText(f));File.Move(f,final);}catch{throw new IOException("Unfinished queue record needs recovery: "+Path.GetFileName(f));}} }
  public int Count { get { return Directory.GetFiles(root,"*.json").Length; } }
  public void Save(Dictionary<string,object> value) { lock(gate) {var name=DateTime.UtcNow.Ticks.ToString("D19")+"-"+Guid.NewGuid().ToString("N");var temp=Path.Combine(root,name+".tmp");var bytes=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(value));using(var f=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough)){f.Write(bytes,0,bytes.Length);f.Flush(true);}File.Move(temp,Path.ChangeExtension(temp,".json"));} }
  public string Oldest() { return Directory.GetFiles(root,"*.json").OrderBy(p=>p,StringComparer.Ordinal).FirstOrDefault(); }
  public string Read(string file) { return File.ReadAllText(file); }
  public void Ack(string file) { File.Delete(file); }
 }
}
