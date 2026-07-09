# Webflow iframe embed script

Use this parent-page script with the GitHub Pages iframe embed. It keeps the iframe auto-height behavior and also sends parent scroll/viewport geometry into the app so the embedded experience can position modal and collection sticky UI against the visible parent viewport.

```html
<iframe
  id="afc-stream-frame"
  src="https://tfooshee.github.io/afcstream/"
  style="width:100%;border:0;display:block;overflow:hidden;"
  scrolling="no"
  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
></iframe>

<script>
(function () {
  const iframe = document.getElementById("afc-stream-frame");
  const childOrigin = "https://tfooshee.github.io";
  let viewportFrame = 0;

  function sendViewportState() {
    viewportFrame = 0;
    if (!iframe || !iframe.contentWindow) return;

    const rect = iframe.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const iframeTop = rect.top + scrollY;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const visibleTopInIframe = Math.max(0, scrollY - iframeTop);
    const visibleCenterInIframe = visibleTopInIframe + viewportHeight / 2;

    iframe.contentWindow.postMessage(
      {
        type: "AFC_PARENT_VIEWPORT",
        scrollY,
        iframeTop,
        viewportHeight,
        visibleTopInIframe,
        visibleCenterInIframe
      },
      childOrigin
    );
  }

  function queueViewportState() {
    if (viewportFrame) return;
    viewportFrame = window.requestAnimationFrame(sendViewportState);
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== childOrigin) return;
    if (event.data && event.data.type === "AFC_STREAM_HEIGHT") {
      iframe.style.height = Math.ceil(Number(event.data.height) || 0) + "px";
      queueViewportState();
    }
  });

  window.addEventListener("load", queueViewportState);
  window.addEventListener("scroll", queueViewportState, { passive: true });
  window.addEventListener("resize", queueViewportState, { passive: true });
  queueViewportState();
})();
</script>
```
