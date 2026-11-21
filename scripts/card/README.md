Kartica za naslovnicu markobozac.com (960 × 600, 8 s petlja).
d.json se generira iz site/data.js (rizik po županijama, geometrija, udjeli u AO iz SFCR-a).
Snimanje: posluži ovu mapu na :8777, `python3 rec.py`, pa
`ffmpeg -framerate 30 -i f/%04d.png -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart -an vozila.mp4`.
Na serveru se kopira u themes/markobozac/assets/media/vozila.mp4.
