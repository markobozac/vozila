import asyncio,sys
from playwright.async_api import async_playwright
FPS=30;DUR=8
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--allow-file-access-from-files'])
    pg=await b.new_page(viewport={'width':960,'height':600})
    await pg.goto('http://127.0.0.1:8777/v.html'); await pg.wait_for_function('window.READY')
    only=sys.argv[1:] 
    frames=[float(x) for x in only] if only else [i/FPS for i in range(FPS*DUR)]
    for i,t in enumerate(frames):
      await pg.evaluate(f'render({t})')
      await pg.screenshot(path=f'f/{i:04d}.png')
    await b.close()
asyncio.run(main())
