(() => {
  const videos = [...document.querySelectorAll('video')];
  // Starting one clip pauses the other clips in the comparison grid.
  videos.forEach(video => video.addEventListener('play', () => {
    videos.forEach(other => { if (other !== video) other.pause(); });
  }));
})();
