"""ティア表のページを組み立てる： python3 dev/tier/build.py  →  tier/index.html"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
css = open(os.path.join(HERE, 'tier.css')).read().strip()
js = open(os.path.join(HERE, 'tier.js')).read()
FB = 'https://www.gstatic.com/firebasejs/10.12.2/'
URL = 'https://yamadachimney.github.io/kitami-keion-yoyaku/tier/'
html = f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>北見軽音ティア表</title>
<meta name="description" content="北見工大 軽音サークルのティア表。お題ごとにみんなのティア表と平均が見られる">
<meta property="og:type" content="website">
<meta property="og:title" content="北見軽音ティア表">
<meta property="og:description" content="お題ごとにみんなのティア表と平均が見られる">
<meta property="og:url" content="{URL}">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#2448d6">
<link rel="icon" href="../icons/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="../icons/apple-touch-icon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap">
<style>
{css}
</style>
</head>
<body>
<div class="app" id="app"></div>
<div class="toast" id="toast" hidden></div>
<div class="overlay" id="overlay" hidden></div>
<script src="{FB}firebase-app-compat.js"></script>
<script src="{FB}firebase-auth-compat.js"></script>
<script src="{FB}firebase-database-compat.js"></script>
<script src="../firebase-config.js"></script>
<script>
{js}</script>
</body>
</html>
'''
os.makedirs(os.path.join(ROOT, 'tier'), exist_ok=True)
open(os.path.join(ROOT, 'tier', 'index.html'), 'w').write(html)
open(os.path.join(HERE, 'built_check.js'), 'w').write(js)
print('tier/index.html', len(html))
