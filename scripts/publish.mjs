#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build,root,files,slugValid} from './build.mjs';
const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const git=(args,cwd=root)=>run('git',args,cwd);
const exists=async p=>!!(await fs.stat(p).catch(()=>null));
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function importEntry(repo,source,slug,opts={},update=false) {
  if(!slugValid(slug)) throw Error('Slug must contain lowercase letters, numbers and single hyphens.');
  const dest=path.join(repo,'content',slug), present=await exists(dest);
  if(present!==update) throw Error(present?`Entry ${slug} exists; use update.`:`Entry ${slug} does not exist.`);
  const old=present?JSON.parse(await fs.readFile(path.join(dest,'entry.json'),'utf8')):{};
  const title=opts.title??old.title;
  if(!title?.trim())throw Error('--title is required for a new entry.');
  const stat=await fs.lstat(source);
  if(stat.isSymbolicLink())throw Error('Source cannot be a symlink.');
  const meta={title,description:opts.description??old.description??'',date:old.date??new Date().toISOString().slice(0,10),updated:new Date().toISOString(),tags:opts.tags!==undefined?opts.tags.split(',').map(s=>s.trim()).filter(Boolean):old.tags??[],unlisted:opts.listed?false:opts.unlisted?true:old.unlisted??false};
  const parent=path.join(repo,'content');await fs.mkdir(parent,{recursive:true});
  const stage=await fs.mkdtemp(path.join(parent,'.import-'));
  try {
    if(stat.isDirectory()) {
      for(const p of await files(source)){const target=path.join(stage,path.relative(source,p));await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(p,target);}
    } else {
      const ext=path.extname(source).toLowerCase();if(!['.md','.html'].includes(ext))throw Error('Input must be Markdown, HTML, or a folder.');
      await fs.copyFile(source,path.join(stage,'index'+ext));
    }
    if((await exists(path.join(stage,'index.md'))) === (await exists(path.join(stage,'index.html'))))throw Error('Input must contain exactly one index.md or index.html.');
    await fs.writeFile(path.join(stage,'entry.json'),JSON.stringify(meta,null,2)+'\n');
    // Rename keeps failed imports from leaving half-written entries.
    const backup=dest+'.backup-'+randomUUID();
    if(present)await fs.rename(dest,backup);
    try{await fs.rename(stage,dest)}catch(e){if(present)await fs.rename(backup,dest);throw e}
    if(present)await fs.rm(backup,{recursive:true});
    return meta;
  }finally{await fs.rm(stage,{recursive:true,force:true})}
}
export async function validateLinks(output) {
  async function walk(dir){for(const d of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())await walk(p);else if(d.name.endsWith('.html')){
    const html=await fs.readFile(p,'utf8');
    for(const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)){
      const link=match[1].replace(/&amp;/g,'&');if(!link||/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(link))continue;
      const clean=decodeURIComponent(link.split(/[?#]/)[0]);if(!clean)continue;
      const target=clean.startsWith('/')?path.resolve(output,'.'+clean):path.resolve(path.dirname(p),clean);
      if(!(target===output||target.startsWith(output+path.sep))||!await exists(target))throw Error(`Missing local link in ${path.relative(output,p)}: ${link}`);
    }
  }}}await walk(output);
}
async function waitLive(config,sha,slug,expected) {
  const deadline=Date.now()+600000;
  while(Date.now()<deadline){
    const runs=JSON.parse(run('gh',['run','list','--repo',config.repository,'--workflow','pages.yml','--commit',sha,'--json','databaseId,status,conclusion,url']));
    const completed=runs.find(r=>r.status==='completed');
    if(completed&&completed.conclusion!=='success')throw Error(`Commit pushed, deployment ${completed.conclusion}: ${completed.url}. Do not publish a duplicate; inspect this run.`);
    if(completed){
      const url=new URL(slug+'/',config.url);
      try{const response=await fetch(url+'?verify='+sha,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(response.ok&&hash(Buffer.from(await response.arrayBuffer()))===expected)return url.href;}catch{}
    }
    await new Promise(r=>setTimeout(r,5000));
  }
  throw Error(`Commit ${sha} pushed; live verification timed out. Inspect https://github.com/${config.repository}/actions before retrying.`);
}
async function main(){
  const {values:o,positionals:p}=parseArgs({allowPositionals:true,options:{title:{type:'string'},description:{type:'string'},tags:{type:'string'},slug:{type:'string'},unlisted:{type:'boolean'},listed:{type:'boolean'},local:{type:'boolean'},help:{type:'boolean'}}});
  if(o.help||!p.length){console.log('scratch publish <file-or-folder> --title "Title" [--slug slug] [--description text] [--tags a,b] [--unlisted] [--local]\nscratch update <slug> <file-or-folder> [--title text] [--listed|--unlisted] [--local]\n--local imports and builds without committing or publishing. Updates replace the entire entry folder.');return;}
  const update=p[0]==='update';if(!['publish','update'].includes(p[0])||p.length!==(update?3:2))throw Error('Use scratch --help for usage.');
  if(o.listed&&o.unlisted)throw Error('Choose either --listed or --unlisted.');
  const source=path.resolve(p[update?2:1]);
  const slug=update?p[1]:o.slug??(o.title||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(!slugValid(slug))throw Error('Provide a title or valid --slug.');
  const config=JSON.parse(await fs.readFile(path.join(root,'site.json'),'utf8'));
  if(o.local){await importEntry(root,source,slug,o,update);await build();await validateLinks(path.join(root,'dist'));console.log(`Staged locally: content/${slug}/\nPreview: npm run preview → http://127.0.0.1:4173/${slug}/`);return;}
  // Resolve authentication and remote before creating a worktree or touching content.
  run('gh',['repo','view',config.repository,'--json','name']);
  const remote=git(['remote','get-url','origin']);
  if(!remote.endsWith(config.repository+'.git')&&!remote.endsWith(config.repository))throw Error('origin does not match site.json repository.');
  git(['fetch','origin',config.branch]);
  const workParent=path.join(os.homedir(),'dev','.worktrees',path.basename(root));await fs.mkdir(workParent,{recursive:true});
  const work=path.join(workParent,'publish-'+slug+'-'+randomUUID().slice(0,8));
  const out=await fs.mkdtemp(path.join(os.tmpdir(),'scratch-build-'));
  let pushed=false,created=false;
  try{
    git(['worktree','add','--detach',work,'origin/'+config.branch]);created=true;
    const entryPath='content/'+slug;
    const previous=git(['ls-tree','HEAD','--',entryPath],work);
    await importEntry(work,source,slug,o,update);await build(work,out);await validateLinks(out);
    const expected=hash(await fs.readFile(path.join(out,slug,'index.html')));
    git(['add','--',entryPath],work);git(['commit','-m',`${update?'Update':'Publish'} ${slug}`],work);
    for(let attempt=0;attempt<3;attempt++){
      try{git(['push','origin',`HEAD:refs/heads/${config.branch}`],work);pushed=true;break;}catch(e){
        if(attempt===2)throw e;
        git(['fetch','origin',config.branch],work);
        if(git(['ls-tree','origin/'+config.branch,'--',entryPath],work)!==previous)throw Error(`Another publisher changed ${slug}; preserved your work at ${work}.`);
        git(['rebase','origin/'+config.branch],work);
        await build(work,out);await validateLinks(out);
      }
    }
    const sha=git(['rev-parse','HEAD'],work);
    console.log(`Pushed ${sha}. Waiting for deployment and content verification…`);
    const url=await waitLive(config,sha,slug,expected);console.log(`Published: ${url}`);
  }finally{
    await fs.rm(out,{recursive:true,force:true});
    if(created&&pushed){
      const dirty=git(['status','--porcelain','--untracked-files=all'],work);
      const ignored=git(['ls-files','--others','--ignored','--exclude-standard'],work);
      if(!dirty&&!ignored)git(['worktree','remove',work]);else console.error(`Preserved worktree: ${work}`);
    }else if(created)console.error(`Publish did not complete. Work preserved: ${work}`);
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1});
