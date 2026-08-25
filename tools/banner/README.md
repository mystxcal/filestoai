# README banner

`banner.html` is the source of truth. Every frame is a pure function of loop
time: the same input renders the same frame, and the ten-second loop closes
without a crossfade.

```console
python tools/banner/build_banner.py
```

The scene is the product rather than a mascot. A project tree is inspected on
the left, ignored and non-text files fall away, the chosen source passes
through a measured aperture, and one structured context document settles on
the right. Light and dark variants are generated for the README.

Rendering needs Chrome, Node with `puppeteer-core`, ffmpeg, gifsicle and Pillow.
The rendered assets are release artwork; the application does not depend on
these tools.
