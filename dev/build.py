import re,os
HERE=os.path.dirname(os.path.abspath(__file__)); SRC=os.path.join(HERE,'src'); OUT=os.path.dirname(HERE)
p1=open(SRC+'/part1.html').read()
title_end=p1.index('</title>')+len('</title>')
head_rest=p1[title_end:p1.index('<div class="app">')]   # fonts link + <style>…</style>
body=p1[p1.index('<div class="app">'):]
order=['part2.js','part2db.js','part3.js','part3b.js','part3c.js','part3d.js','part4a.js','part4b.js','part4d.js','part5.js','part4c.js']
js=''.join(open(SRC+'/'+f).read() for f in order)
FB='https://www.gstatic.com/firebasejs/10.12.2/'
html=f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>北見工大 軽音予約</title>
<meta name="description" content="北見工大 軽音サークルの部室予約">
<meta property="og:type" content="website">
<meta property="og:title" content="北見工大 軽音予約">
<meta property="og:description" content="北見工大 軽音サークルの部室予約">
<meta property="og:url" content="https://yamadachimney.github.io/kitami-keion-yoyaku/">
<meta property="og:image" content="https://yamadachimney.github.io/kitami-keion-yoyaku/icons/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#2448d6">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="北見軽音予約">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
{head_rest.strip()}
</head>
<body>
{body.strip()}
<script src="{FB}firebase-app-compat.js"></script>
<script src="{FB}firebase-auth-compat.js"></script>
<script src="{FB}firebase-database-compat.js"></script>
<script src="firebase-config.js"></script>
<script>
{js}</script>
<script>
if('serviceWorker' in navigator){{window.addEventListener('load',()=>{{navigator.serviceWorker.register('sw.js').catch(()=>{{}})}})}}
</script>
</body>
</html>
'''
import sys
if len(sys.argv)>1 and sys.argv[1]=='beta':
    os.makedirs(OUT+'/beta',exist_ok=True)
    bh=html.replace('href="manifest.webmanifest"','href="../manifest.webmanifest"').replace('"icons/','"../icons/').replace('src="firebase-config.js"','src="../firebase-config.js"')
    bh=bh.replace("navigator.serviceWorker.register('sw.js')","Promise.reject()")
    bh=bh.replace('<meta name="robots"','<meta name="robots"')
    bh=bh.replace('<head>','<head>\n<meta name="robots" content="noindex">',1)
    open(OUT+'/beta/index.html','w').write(bh)
    print('beta',len(bh))
else:
    open(OUT+'/index.html','w').write(html)
open(os.path.join(HERE,'built_check.js'),'w').write(js)  # node --check で文法チェック用
print('index.html',len(html))
