---
title: "Release highlights"
description: "For maintainers: attach a short clip or picture to an official release so the release digest can show what changed."
---

Official releases are announced on [r/hyprune](https://www.reddit.com/r/hyprune) in one
digest post per release round (about one a day). Worlds and core releases are the headline,
each with a picture when the release has one; SDK, schema, shell and meta releases are
one-line items under "Also released". A highlight is the picture or clip that shows what
changed.

## The convention

Attach the highlight to the GitHub release as an extra asset named after the release's other
assets, ending in `.highlight.<ext>`:

```
<name>-<version>.highlight.mp4
<name>-<version>.highlight.gif
<name>-<version>.highlight.png   (or .jpg)
```

For example `com.hyprune.lumen-reach-0.12.0.highlight.mp4` next to
`com.hyprune.lumen-reach-0.12.0.tar.zst`, or `hyprune-core-0.11.0.highlight.png`.

| Asset | What | Limits |
| --- | --- | --- |
| `.mp4` | The clip: 10-20 s, 1920 x 1080, H.264, `yuv420p`, `+faststart`, silent or AAC | Under 100 MB. Linked from the post ("Watch the clip"), not embedded. |
| `.gif` | A short loop of the same moment | Under 20 MB: about 5-8 s at 1280 px wide and 15 fps. |
| `.png` / `.jpg` | A still, 1920 x 1080 | Under 20 MB. |

The post embeds pictures (GIF or still) and links the MP4, so ship an MP4 together with a GIF
or still of the same moment. A GIF is shown in preference to a still. Files over 20 MB are
skipped. Without a highlight the digest shows the package's card thumbnail
(`<id>-<version>.thumb-1.png`, see [Publishing a package](/publishing/)); without either, the
entry is text only.

## Making one

Show the change itself, from a reachable spot, with only Hyprune content and windows you are
happy to publish on screen. Cut and encode from a 1080p capture:

```sh
ffmpeg -ss 5 -t 15 -i capture.mkv -an -vf "scale=1920:-2,fps=30" \
  -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart \
  com.hyprune.lumen-reach-0.12.0.highlight.mp4
ffmpeg -ss 8 -t 6 -i capture.mkv -vf "fps=15,scale=1280:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" \
  com.hyprune.lumen-reach-0.12.0.highlight.gif
gh release upload lumen-reach-v0.12.0 com.hyprune.lumen-reach-0.12.0.highlight.*
```

Upload the highlight within about two hours of publishing the release: the digest waits that
long for a round to settle before it posts.

## The text

The digest takes the first sentences of the release notes (or the first bullet points, if the
notes are a list) as short bullets, and leaves out hashes and archive boilerplate. Lead with
what a user will notice: "A lantern market in the Sun Court." says more than "Fixes from live
review."
