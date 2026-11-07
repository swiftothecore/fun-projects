/* Local page/layout smoke checks. External API, SDK, font and media requests
 * are blocked. Set PLAYWRIGHT_PATH and BROWSER_PATH for your installation. */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const apps=['','album-atlas','apple-music','music-videos','my-watchlist','olivia-countdown','palette-painter','petal-countdown','reading-room','sotr-countdown','tech-acronyms','thirteen','tv-reverie'];
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',headless:true});
  let failed=0;
  try {
    for(const width of [1280,390])for(const app of apps){
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Australia/Melbourne'});
      const page=await context.newPage(),errors=[],missing=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin==='http://localhost'){
          const file=path.join(root,decodeURIComponent(url.pathname));
          if(fs.existsSync(file)&&fs.statSync(file).isFile()){
            const type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.otf':'font/otf','.ttf':'font/ttf','.html':'text/html'}[path.extname(file)]||'application/octet-stream';
            return route.fulfill({body:fs.readFileSync(file),contentType:type});
          }
          missing.push(url.pathname);
        }
        return route.fulfill({status:503,body:''});
      });
      await page.goto(`http://localhost/${app?app+'/':''}index.html`,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(300);
      if(app==='tech-acronyms')await page.evaluate(()=>{startQuiz([{a:'CPU',m:'Central Processing Unit',c:'Hardware'}]);document.getElementById('userInput').value='Central Processing Unit';evaluateAnswer();goNext();});
      const layout=await page.evaluate(()=>({body:document.body.innerText.length,overflow:document.documentElement.scrollWidth-innerWidth}));
      const bad=errors.length||missing.length||!layout.body||layout.overflow>2;
      if(bad)failed++;
      console.log(`${bad?'FAIL':'PASS'} ${app||'home'} ${width}px ${JSON.stringify({errors,missing,overflow:layout.overflow})}`);
      if(process.env.SCREENSHOTS){fs.mkdirSync(process.env.SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOTS,`${app||'home'}-${width}.png`),fullPage:true});}
      await context.close();
    }
  }finally{await browser.close();}
  if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
