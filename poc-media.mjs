// L05C MIoT media actions can fail while MiNA's media control remains usable.
// An accepted request is not proof of physical silence; keep that distinction.
export async function pauseNativeMedia(mina, current = () => true) {
  for (const action of ['pause', 'stop']) {
    if (!current()) return false;
    try {
      const result = await mina.callUbus('mediaplayer', 'player_play_operation', { action, media: 'app_ios' });
      if (result?.code === 0) return true;
    } catch {}
  }
  return false;
}
