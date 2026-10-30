import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {marked} from 'marked';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function slugValid(s) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && !['index','assets','manifest','404'].includes(s); }
export async function files(dir) {
  const result=[];
  for (const item of await fs.readdir(dir,{withFileTypes:true})) {
    if(item.name.startsWith('.') || ['node_modules','entry.json'].includes(item.name)) continue;
    const p=path.join(dir,item.name);
    if(item.isSymbolicLink()) throw new Error(`Symlinks are not supported: ${p}`);
    if(item.isDirectory()) result.push(...await files(p)); else result.push(p);
  }
  return result;
}
export async function build(repo=root, output=path.join(repo,'dist')) {
  const config=JSON.parse(await fs.readFile(path.join(repo,'site.json'),'utf8'));
  const template=await fs.readFile(path.join(root,'templates/note.html'),'utf8');
  const entries=[];
  await fs.mkdir(path.join(repo,'content'),{recursive:true});
  for(const d of await fs.readdir(path.join(repo,'content'),{withFileTypes:true})) {
    if(d.name.startsWith('.')) continue;
    if(!d.isDirectory() || !slugValid(d.name)) throw new Error(`Invalid entry folder: ${d.name}`);
    const dir=path.join(repo,'content',d.name);
    const meta=JSON.parse(await fs.readFile(path.join(dir,'entry.json'),'utf8'));
    if(typeof meta.title!=='string'||!meta.title.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)||Number.isNaN(Date.parse(meta.date))||typeof meta.description!=='string'||!Array.isArray(meta.tags)||meta.tags.some(t=>typeof t!=='string')||typeof meta.unlisted!=='boolean') throw new Error(`Invalid metadata: ${d.name}`);
    const all=await files(dir);
    const md=all.includes(path.join(dir,'index.md')), html=all.includes(path.join(dir,'index.html'));
    if(md===html) throw new Error(`${d.name} must contain exactly one index.md or index.html`);
    entries.push({...meta,slug:d.name,dir,all,md});
  }
  await fs.rm(output,{recursive:true,force:true}); await fs.mkdir(output,{recursive:true});
  const page=(title,description,body,home)=>template.replace(/\{\{(title|description|body|home|siteTitle|github)\}\}/g,(_,key)=>({title:escape(title),description:escape(description),body,home,siteTitle:escape(config.title),github:`https://github.com/${config.repository}`}[key]));
  for(const e of entries) {
    const dest=path.join(output,e.slug); await fs.mkdir(dest,{recursive:true});
    for(const source of e.all) {
      const relative=path.relative(e.dir,source);
      if(relative==='index.md') continue;
      const target=path.join(dest,relative); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.copyFile(source,target);
    }
    if(e.md) {
      const body=marked.parse(await fs.readFile(path.join(e.dir,'index.md'),'utf8'));
      const updated=e.updated&&e.updated.slice(0,10)!==e.date?`<span>Updated ${escape(e.updated.slice(0,10))}</span>`:'';
      await fs.writeFile(path.join(dest,'index.html'),page(e.title,e.description,`<article class="note"><header class="note-head"><p class="eyebrow">${escape(e.date)}${e.tags.length?` <span aria-hidden="true">/</span> ${e.tags.map(escape).join(' · ')}`:''}</p><h1>${escape(e.title)}</h1>${e.description?`<p class="note-description">${escape(e.description)}</p>`:''}${updated}</header><div class="prose">${body}</div></article>`,'../'));
    }
  }
  const listed=entries.filter(e=>!e.unlisted).sort((a,b)=>b.date.localeCompare(a.date)||a.slug.localeCompare(b.slug));
  const byYear=Object.groupBy(listed,e=>e.date.slice(0,4));
  const indexGroups=Object.entries(byYear).map(([year,items])=>`<section class="year-group" aria-labelledby="year-${year}"><h2 id="year-${year}">${year}</h2><ul class="entries">${items.map(e=>`<li><a href="./${e.slug}/"><time datetime="${escape(e.date)}">${escape(e.date.slice(5).replace('-', '.'))}</time><div class="entry-copy"><span class="entry-title">${escape(e.title)} <span class="arrow" aria-hidden="true">↗</span></span><p>${escape(e.description)}</p>${e.tags.length?`<span class="meta">${e.tags.map(escape).join(' · ')}</span>`:''}</div></a></li>`).join('')}</ul></section>`).join('');
  const body=`<header class="index-head"><p class="kicker">A personal index</p><h1>Notes, experiments,<br>and things worth keeping.</h1><p class="lede">${escape(config.description)}</p></header>${indexGroups||'<p class="empty">A quiet place for the next idea.</p>'}`;
  await fs.writeFile(path.join(output,'index.html'),page(config.title,config.description,body,'./'));
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(listed.map(({slug,title,date,description,tags})=>({slug,title,date,description,tags})),null,2));
  await fs.writeFile(path.join(output,'.nojekyll'),'');
  return entries.map(({slug,title})=>({slug,title}));
}
if(process.argv[1]===fileURLToPath(import.meta.url)) build().then(e=>console.log(`Built ${e.length} entries in dist/`)).catch(e=>{console.error(e.message);process.exitCode=1});
