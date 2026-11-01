// My test-only observation at the RTC session boundary. Created with Codex.
// No wire payload, credential, address or persistent device identifier is retained.
const types=new Set(['call','scall','info','ack','hangup']);
export function wireMetadata(raw){
  let value;
  try{value=JSON.parse(typeof raw==='string'?raw:Buffer.isBuffer(raw)?raw.toString('utf8'):'null');}catch{return {shape:'unparsed'};}
  if(!value||typeof value!=='object')return {shape:'non-object'};
  if(typeof value.data!=='string')return {shape:'non-string-envelope-data'};
  try{const inner=JSON.parse(value.data);return {shape:'sdk-envelope',...signalMetadata(inner)};}catch{return {shape:'unparsed-inner'};}
}
export function signalMetadata(inner) {
  if(!inner||typeof inner!=='object')return {};
  const result={type:types.has(inner.dataType)?inner.dataType:'other'};
  for(const key of ['action','code','isResponse'])if(Number.isSafeInteger(inner[key]))result[key]=inner[key];
  let body;try{body=typeof inner.data==='string'?JSON.parse(inner.data):undefined;}catch{}
  if(body&&typeof body==='object'){
    if(Number.isSafeInteger(body.status))result.status=body.status;
    if(result.type==='call'||result.type==='scall')result.hasTurn=!!body.turn;
    if(result.type==='info'){
      result.hasSdp=typeof body.sdp==='string'||(body.format==='SDP'&&typeof body.value==='string');
      result.hasCandidate=typeof body.candidate==='string'||body.format==='CANDIDATE';
    }
  }
  return result;
}

export function observeSessions(client, mode, record) {
  if(!['scall','call'].includes(mode))throw Error('unsupported_diagnostic_mode');
  const router=client.rtc;
  if(typeof router?.newSession!=='function')throw Error('diagnostic_boundary_changed');
  const original=router.newSession;let count=0;
  router.newSession=function(route,...args){
    const id=++count;
    const session=original.call(this,{...route,signalingMode:mode},...args);
    const signal=session.signaling;
    if(!signal?.on||typeof signal.sendSession!=='function')throw Error('diagnostic_signaling_boundary_changed');
    record({session:id,direction:'session',mode});
    const factory=signal.createSocket;
    if(typeof factory==='function')signal.createSocket=function(...args){
      const socket=factory.apply(this,args);
      socket.addEventListener('message',event=>record({session:id,direction:'wire-in',...wireMetadata(event.data)}));
      return socket;
    };
    const onMessage=inner=>record({session:id,direction:'in',...signalMetadata(inner)});
    signal.on('message',onMessage);
    const send=signal.sendSession;
    signal.sendSession=function(type,payload={}){
      record({session:id,direction:'out',type:types.has(type)?type:'other',hasSdp:typeof payload.sdp==='string',hasCandidate:typeof payload.candidate==='string'});
      return send.call(this,type,payload);
    };
    session.on('close',()=>{record({session:id,direction:'closed'});signal.off('message',onMessage);signal.sendSession=send;});
    return session;
  };
  return ()=>{router.newSession=original;};
}
