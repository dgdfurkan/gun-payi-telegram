from pathlib import Path
import zipfile,json
root=Path(__file__).resolve().parent.parent
out=root/'dist'/'gun-payi-telegram-service.zip'
files=['telegram-worker/worker.mjs','telegram-worker/core.mjs','telegram-worker/deploy.mjs','dist/plan-icons.js']
package={'name':'gun-payi-telegram-service','private':True,'type':'module','scripts':{'deploy':'node telegram-worker/deploy.mjs'},'devDependencies':{'wrangler':'4.163.0'}}
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name in files: archive.write(root/name,name)
    archive.write(root/'telegram-worker/wrangler.jsonc','wrangler.jsonc')
    archive.write(root/'telegram-worker/README.md','README.md')
    archive.writestr('package.json',json.dumps(package,ensure_ascii=False,indent=2))
print(str(out))
