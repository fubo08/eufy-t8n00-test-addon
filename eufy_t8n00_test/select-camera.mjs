// Discovery records are not bound Device instances. Created with Codex.
export async function selectCamera(client,onStage=()=>{},targetSn) {
 onStage('device-discovery');
 const records=await client.getDevices();
 const nvr=records.find(d=>d.model==='T8N00');
 if(!targetSn)throw new Error('explicit diagnostic target required');
 const target=records.find(d=>d.sn===targetSn&&d.model==='T8E00'&&d.stationSn===nvr?.sn);
 if(!target)throw new Error('attached S4 missing');
 onStage('device-binding');
 const bound=await client.getDevice(target.sn);
 onStage('camera-capability');
 return {camera:bound.camera(),model:target.model};
}
