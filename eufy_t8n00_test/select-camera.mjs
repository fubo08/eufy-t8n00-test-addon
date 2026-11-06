// Discovery records are not bound Device instances. Created with Codex.
export async function selectCamera(client) {
 const records=await client.getDevices();
 const nvr=records.find(d=>d.model==='T8N00');
 const target=records.find(d=>d.model==='T8E00'&&d.stationSn===nvr?.sn);
 if(!target)throw new Error('attached S4 missing');
 const bound=await client.getDevice(target.sn);
 return {camera:bound.camera(),model:target.model};
}
