// Doit exister avant le chargement du SDK, qui appelle ce callback dès qu'il est prêt
window.spotifySdkReady = new Promise(r => { window.onSpotifyWebPlaybackSDKReady = r; });
