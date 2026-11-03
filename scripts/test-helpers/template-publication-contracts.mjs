import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, resolve} from 'node:path';
import {createServer} from 'node:net';
import {activateFixtureSource, publicationEnvelope} from './publication-protocol.mjs';

// A bounded real HTTP/SQLite contract inside the existing template smoke owner.
// No packaging, provider, production installation or Desktop build is invoked.
export async function exercisePublicationContracts({accessOnly = false, tableOnly = false} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ya-template-contract-'));
  const checks = [];
  const desktop = accessOnly ? null : await desktopPublicationSources(root);
  try {
    const blackseaRoot = resolve(process.env.YA_TEMPLATE_BLACKSEA_ROOT || '../blacksea_web');
    const skins = ['canonical', ...(existsSync(join(blackseaRoot,'site/config.php')) ? ['blacksea'] : [])];
    for (const skin of skins) {
      const site = join(root, skin), publicRoot = join(site, 'public');
      cpSync(resolve('web-site-template'), site, {recursive:true});
      if (skin === 'blacksea') cpSync(join(blackseaRoot,'site'), join(site, 'site'), {recursive:true});
      const hosting = join(publicRoot, 'yardimci-asistan'), source = resolve('firm-template/web-module');
      cpSync(source, hosting, {recursive:true, filter:path => {
        const name = relative(source, path);
        return !/^(?:data|media)(?:\/|$)/.test(name) && !name.includes('.local.');
      }});
      mkdirSync(join(hosting, 'data'), {recursive:true});
      const secret = 'isolated-template-contract-secret';
      writeFileSync(join(hosting, 'config/business.json'), JSON.stringify({id:'fixture', profile_id:'pension', sync_secret:secret, allowed_origins:[]}));
      const probe = createServer();
      await new Promise(done => probe.listen(0, '127.0.0.1', done));
      const port = probe.address().port;
      await new Promise(done => probe.close(done));
      const origin = `http://127.0.0.1:${port}`, api = origin + '/yardimci-asistan';
      const config = {api_origin:origin, api_base_path:'/yardimci-asistan', base_path:'', local_api_root:hosting,
        php_cli_binary:'/usr/bin/php', effects:[], extensions:skin === 'blacksea' ? {cide:{key:'theme.blacksea.cide',editorial:true}} : {}};
      writeFileSync(join(site, 'site/config.php'), `<?php return json_decode(<<<'JSON'\n${JSON.stringify(config)}\nJSON,true);\n`);
      const server = spawn('php', ['-d','opcache.enable=0','-S',`127.0.0.1:${port}`,'-t',publicRoot], {stdio:'ignore'});
      const request = (path, body) => fetch(api + '/api/' + path + '.php', body === undefined ? {} : {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const read = async path => (await request(path)).json();
      const page = async id => {
        const response = await fetch(origin + '/?page=' + id);
        return {status:response.status, html:await response.text()};
      };
      try {
        for (let n=0;;n++) {
          try { if ((await request('version')).ok) break; } catch {}
          assert.ok(n < 100, 'Temporary PHP service starts');
          await new Promise(done => setTimeout(done,20));
        }
        if (!tableOnly) {
        const before = (await read('business')).business;
        assert.equal(before.requests_enabled,false);
        assert.deepEqual(before.request_types,[]);
        assert.equal((await request('request',{request_type:'general_info'})).status,403);
        assert.equal((await page('account')).status,404);
        }
        const client = 'template-contract-' + skin;
        await activateFixtureSource(api,secret,client);
        const publish = async body => {
          const response = await fetch(api+'/api/sync.php',{method:'POST',headers:{'Content-Type':'application/json','X-YA-Sync-Secret':secret},
            body:JSON.stringify(publicationEnvelope(body,client))});
          assert.equal(response.status,200,await response.text());
        };
        if (tableOnly) {
          await exerciseTableFields({site,api,publish,page,read,checks,client,secret,desktop});
          continue;
        }
        const caps = ['core.customers','customer.requests','accommodation.rooms','food_service.tables'];
        await publish({action:'publish_android_snapshot',snapshot:{business_capabilities:caps}});
        await publish({action:'publish_business_context',business_context:{profile_id:'market',business_name:'Contract fixture',aboutText:'',phone:'',address:''}});
        await publish({action:'publish_room_catalog',room_catalog:{enabled:true,rooms:[{id:'r',name:'Contract room',capacity:2}]}});
        const general = (await read('business')).business;
        assert.ok(general.request_types.includes('general_info'));
        assert.ok(!general.request_types.includes('pension_reservation'));
        assert.ok(!(await page('rooms&id=r')).html.includes('data-ya-action="accommodation.reserve"'));
        const payload = {customer_name:'Synthetic visitor',customer_phone:'+905550100001',guest_count:1,message:'Synthetic question'};
        assert.equal((await request('request',{...payload,request_type:'pension_reservation',idempotency_key:'closed-room'})).status,403);
        assert.equal((await request('request',{...payload,request_type:'restaurant_reservation',idempotency_key:'closed-table'})).status,403);
        assert.equal((await request('request',{...payload,request_type:'general_info',idempotency_key:'generic-without-date'})).status,201);
        await publish({action:'publish_android_snapshot',snapshot:{business_capabilities:[...caps,'accommodation.reservations']}});
        assert.ok((await read('business')).business.request_types.includes('pension_reservation'));
        assert.ok((await page('rooms&id=r')).html.includes('data-ya-action="accommodation.reserve"'));
        await publish({action:'publish_room_catalog',room_catalog:{enabled:false,rooms:[{id:'r',name:'Withdrawn room'}]}});
        assert.equal((await page('rooms&id=r')).status,404);
        const account = enabled => publish({action:'publish_dealer_access',dealer_access:{version:3,online_sales_enabled:enabled,enabled:false,dealers:[]}});
        await account(true);
        assert.equal((await read('account/config')).enabled,true);
        assert.equal((await page('account')).status,200,'Account survives zero products and delivery OFF');
        await account(false);
        assert.equal((await page('account')).status,404);
        await publish({action:'publish_android_snapshot',snapshot:{business_capabilities:[]}});
        assert.deepEqual((await read('business')).business.request_types,[]);
        assert.equal((await request('request',{...payload,request_type:'general_info',idempotency_key:'withdrawn-request'})).status,403);
        checks.push(skin + ': missing/optional/withdrawn capabilities, real generic mutation, room CTA and independent account');
        if (!accessOnly) await exercisePublishedFields({site,origin,api,publish,page,read,checks,client,secret,desktop});
      } finally {
        server.kill();
        await new Promise(done => server.exitCode !== null ? done() : server.once('exit',done));
      }
    }
    return checks;
  } finally { rmSync(root,{recursive:true,force:true}); }
}

async function desktopPublicationSources(root) {
  const {default:ts} = await import('typescript');
  const directory = join(root,'desktop-source');
  mkdirSync(directory);
  for (const name of ['business-capabilities','business-public-profile','business-ai-policy','business-ai-context','public-languages','room-public-details','table-public-details']) {
    writeFileSync(join(directory,name+'.js'),ts.transpileModule(readFileSync(`packages/shared/types/${name}.ts`,'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
    }).outputText);
  }
  writeFileSync(join(directory,'hosting-transport.js'),ts.transpileModule(readFileSync('packages/sync-core/hosting-transport.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText);
  const require = createRequire(import.meta.url);
  return {...require(join(directory,'business-ai-context.js')),...require(join(directory,'business-public-profile.js')),
    ...require(join(directory,'public-languages.js')),...require(join(directory,'room-public-details.js')),
    ...require(join(directory,'table-public-details.js')),...require(join(directory,'hosting-transport.js'))};
}

const mainOf = html => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';

async function sendDesktopProjection(fixture, method, field, value) {
  // Reserve only the fixture identity. The existing source transport performs
  // field serialization, SHA-256 and exact receipt validation itself.
  const identity = publicationEnvelope({action:'publish_'+field,[field]:{}},fixture.client);
  const option = field === 'business_context' ? 'context' : field === 'menu' ? 'menu' : 'catalog';
  const result = await fixture.desktop[method]({baseUrl:fixture.api,syncSecret:fixture.secret,clientId:fixture.client,
    sourceEpoch:identity.source_epoch,sourceRevision:identity.source_revision,idempotencyKey:identity.idempotency_key,[option]:value});
  assert.equal(result.ok,true,result.message);
}

async function exercisePublishedFields(fixture) {
  const {site,origin,publish,page,read,checks,desktop} = fixture;
  const caps = ['core.customers','customer.requests','accommodation.rooms','accommodation.reservations','food_service.tables','food_service.reservations','food_service.menu','channel.qr_menu'];
  await publish({action:'publish_android_snapshot',snapshot:{business_capabilities:caps}});
  const context = desktop.createBusinessAiContext({businessName:'Published field fixture',profileId:'market',phone:'',whatsapp:'',email:'',address:'',enabledCapabilities:caps,
    publicProfile:{mapDisplayMode:'manual',googleMapsEmbedUrl:'',latitude:null,longitude:null,description:'',aboutText:'',directionsNote:'',
      policyNote:'POLICY-FIELD <policy>',paymentNote:'PAYMENT-FIELD',languages:['Deutsch','Türkçe'],features:desktop.BUSINESS_PUBLIC_FEATURE_CATALOG.map(feature=>feature.id),socialLinks:[],
      checkInTime:'14:10',checkOutTime:'11:20',breakfastStartTime:'07:30',breakfastEndTime:'10:40'}});
  await sendDesktopProjection(fixture,'pushBusinessContext','business_context',context);
  const business = (await read('business')).business;
  const clocks = {check_in_time:context.checkInTime,check_out_time:context.checkOutTime,breakfast_start_time:context.breakfastStartTime,breakfast_end_time:context.breakfastEndTime};
  for (const [field,value] of Object.entries(clocks)) assert.equal(business[field],value);
  assert.deepEqual(business.feature_ids,context.featureIds);
  const about = await page('about');
  assert.equal(about.status,200,'Independent public details do not require about text');
  const aboutMain = mainOf(about.html);
  for (const value of Object.values(clocks)) assert.ok(aboutMain.includes(`datetime="${value}"`),'Published clock survives locale formatting');
  assert.ok(aboutMain.includes('POLICY-FIELD &lt;policy&gt;'));
  assert.ok(!aboutMain.includes('POLICY-FIELD <policy>'));
  assert.ok(aboutMain.includes(context.paymentNote));
  for (const value of context.languages) assert.ok(aboutMain.includes(value));
  for (const value of context.features) assert.ok(aboutMain.includes(value));
  checks.push('Desktop source producer/transport → business API → '+site.split('/').at(-1)+' About clocks/policy/payment/languages/features without About text');

  const room = {id:'field-room',name:'Field room',number:'ROOM-NUMBER-27',floor:'FLOOR-LEVEL-4',capacity:2,bedInfo:'ROOM-BED-DETAIL',
    features:desktop.normalizeRoomPublicFeatures(desktop.ROOM_PUBLIC_FEATURE_CATALOG.map(feature=>feature.id)),description:'ROOM-DESCRIPTION',priceNote:'ROOM-PRICE-NOTE',nightlyPriceMinor:123450,currency:'TRY',sortOrder:0,media:[]};
  await sendDesktopProjection(fixture,'pushRoomCatalog','room_catalog',{version:1,enabled:true,updatedAt:'2030-01-01T00:00:00Z',rooms:[room]});
  const publicRoom = (await read('rooms')).rooms[0];
  assert.equal(publicRoom.number,room.number); assert.equal(publicRoom.floor,room.floor);
  const roomPage = await page('rooms&id='+room.id);
  assert.equal(roomPage.status,200);
  for (const value of [room.number,room.floor,room.bedInfo,room.description,room.priceNote]) assert.ok(mainOf(roomPage.html).includes(value));
  for (const feature of desktop.ROOM_PUBLIC_FEATURE_CATALOG) assert.ok(mainOf(roomPage.html).includes('>'+feature.label+'</li>'),'Every canonical public room feature has a presentation label');
  await sendDesktopProjection(fixture,'pushRoomCatalog','room_catalog',{version:1,enabled:true,updatedAt:'',rooms:[{...room,number:'',floor:''}]});
  const emptyRoom = mainOf((await page('rooms&id='+room.id)).html);
  assert.ok(!emptyRoom.includes(room.number) && !emptyRoom.includes(room.floor),'Cleared public fields leave no stale values');
  checks.push('Source room transport → public API → room number/floor/description with explicit field clearing');

  const menu = {enabled:true,categories:[{id:'field-category',name:'Field category',description:'CATEGORY-DESCRIPTION',is_active:true,sort_order:0}],items:[
    {id:'field-menu',product_id:'field-product',category_id:'field-category',name:'MENU-FIELD',description:'MENU-DESCRIPTION',price:125.5,currency:'TRY',
      image_url:'https://media.example.test/menu/field.webp',allergens:['ALLERGEN-FIELD <allergen>'],tags:['TAG-FIELD'],is_featured:true,is_available:true,sort_order:0},
    {id:'unsafe-menu',product_id:'unsafe-product',category_id:'field-category',name:'UNSAFE-IMAGE-ITEM',price:0,currency:'TRY',image_url:'javascript:alert(1)',is_available:true},
    {id:'hidden-menu',product_id:'hidden-product',category_id:'field-category',name:'UNPUBLISHED-MENU-ITEM',price:1,currency:'TRY',is_available:false}
  ]};
  await sendDesktopProjection(fixture,'pushMenu','menu',menu);
  const publicMenu = await read('menu');
  assert.equal(publicMenu.items.find(item=>item.id==='field-menu').image_url,menu.items[0].image_url);
  assert.deepEqual(publicMenu.items.find(item=>item.id==='field-menu').allergens,menu.items[0].allergens);
  const menuMain = mainOf((await page('menu')).html);
  for (const value of [menu.categories[0].description,menu.items[0].image_url,'ALLERGEN-FIELD &lt;allergen&gt;','TAG-FIELD']) assert.ok(menuMain.includes(value));
  assert.ok(menuMain.includes('class="menu-featured"'));
  assert.ok(!menuMain.includes('javascript:') && !menuMain.includes('UNPUBLISHED-MENU-ITEM'));
  await sendDesktopProjection(fixture,'pushMenu','menu',{...menu,items:[{...menu.items[0],image_url:'',allergens:[],tags:[],is_featured:false}]});
  const clearedMenu = mainOf((await page('menu')).html);
  for (const value of [menu.items[0].image_url,'ALLERGEN-FIELD','TAG-FIELD','class="menu-featured"']) assert.ok(!clearedMenu.includes(value));
  await sendDesktopProjection(fixture,'pushMenu','menu',{enabled:false,categories:menu.categories,items:menu.items});
  const withdrawnMenu = await page('menu');
  assert.equal(withdrawnMenu.status,404); assert.ok(!mainOf(withdrawnMenu.html).includes('MENU-FIELD'));
  checks.push('Source menu transport → API → image/allergens/tags/featured, safe media, empty fields and withdrawal');

  await exerciseTableFields(fixture);
  await publish({action:'publish_android_snapshot',snapshot:{business_capabilities:caps}});
  const source = await (await fetch(origin+'/?resource=translation-source')).json();
  const key = id => source.id+':business.feature.'+id;
  const localization = {version:1,source_language:'tr',business_id:'desktop-field-business',target_languages:['de','ar'],site_catalog:source,
    languages:desktop.PUBLIC_LANGUAGES.filter(language=>['tr','de','ar'].includes(language.code)),translations:{
      site_text:{[key('parking')]:{de:{text:'DE-PARKING-FIELD'},ar:{text:'AR-PARKING-FIELD'}},[key('garden')]:{de:{text:'DE-GARDEN-FIELD'},ar:{text:'AR-GARDEN-FIELD'}}},
      business:{'desktop-field-business':{de:{policy_note:'DE-POLICY-FIELD'},ar:{policy_note:'AR-POLICY-FIELD'}}}
    }};
  await sendDesktopProjection(fixture,'pushBusinessContext','business_context',{...context,localization});
  for (const [language,direction,prefix] of [['de','ltr','DE'],['ar','rtl','AR']]) {
    const response = await page('about&lang='+language);
    assert.equal(response.status,200);
    assert.ok(response.html.includes(`lang="${language}" dir="${direction}"`));
    const main = mainOf(response.html);
    assert.ok(main.includes(prefix+'-PARKING-FIELD') && main.includes(prefix+'-GARDEN-FIELD'));
    assert.ok(main.includes(prefix+'-POLICY-FIELD'));
    assert.ok(main.includes(desktop.getBusinessPublicFeatureLabel('pet_friendly')),'One missing translation preserves the Turkish feature label');
    assert.ok(main.includes('datetime="14:10"'));
  }
  const catalogPath = join(site,'locales/tr.json'), originalCatalog = readFileSync(catalogPath,'utf8');
  try {
    const changed = JSON.parse(originalCatalog); changed['business.feature.parking']='CHANGED-SOURCE-PARKING';
    writeFileSync(catalogPath,JSON.stringify(changed));
    const stale = mainOf((await page('about&lang=de')).html);
    assert.ok(stale.includes('CHANGED-SOURCE-PARKING') && !stale.includes('DE-PARKING-FIELD'));
    assert.ok(stale.includes('DE-GARDEN-FIELD'),'Unchanged key retains its matching translated hash');
  } finally { writeFileSync(catalogPath,originalCatalog); }
  await sendDesktopProjection(fixture,'pushBusinessContext','business_context',{...context,localization:{version:1,source_language:'tr',target_languages:[],translations:{}}});
  const languageWithdrawn = await page('about&lang=ar');
  assert.ok(languageWithdrawn.html.includes('lang="tr" dir="ltr"'));
  assert.ok(!mainOf(languageWithdrawn.html).includes('AR-PARKING-FIELD'));
  // Each detail group independently keeps About reachable, including literal "0".
  const emptyContext = {...context,aboutText:'',policyNote:'',paymentNote:'',languages:[],features:[],featureIds:[],checkInTime:'',checkOutTime:'',breakfastStartTime:'',breakfastEndTime:''};
  await sendDesktopProjection(fixture,'pushRoomCatalog','room_catalog',{version:1,enabled:false,updatedAt:'',rooms:[]});
  for (const detail of [{policyNote:'INDEPENDENT-POLICY'},{paymentNote:'INDEPENDENT-PAYMENT'},{languages:['INDEPENDENT-LANGUAGE']},
    {features:['PUBLISHED-UNKNOWN-FEATURE'],featureIds:['unknown_feature']},{checkInTime:'14:10'},{aboutText:'0'}]) {
    await sendDesktopProjection(fixture,'pushBusinessContext','business_context',{...emptyContext,...detail});
    assert.equal((await page('about')).status,200,'Every customer-visible detail group has an independent page gate');
    assert.ok(!/class="[^"]*\bempty-state\b/.test((await page('home')).html),'Published independent details suppress the homepage empty state');
  }
  await sendDesktopProjection(fixture,'pushBusinessContext','business_context',emptyContext);
  assert.equal((await page('about')).status,404,'Clearing every published detail removes About');
  assert.ok(/class="[^"]*\bempty-state\b/.test((await page('home')).html),'Empty business publications retain the honest homepage empty state');
  await sendDesktopProjection(fixture,'pushBusinessContext','business_context',{...emptyContext,gallery:[{id:'g',kind:'photo',title:'Gallery-only fixture',sortOrder:0,url:'/yardimci-asistan/media/gallery/gallery/fixture.jpg'}]});
  assert.ok(!/class="[^"]*\bempty-state\b/.test((await page('home')).html),'Gallery-only publication is not reported as empty');
  const embed = 'https://www.google.com/maps/embed?pb=synthetic-location';
  await sendDesktopProjection(fixture,'pushBusinessContext','business_context',{...emptyContext,mapDisplayMode:'google_maps_embed',googleMapsEmbedUrl:embed});
  const location = (await read('business')).business;
  assert.ok(location.public_surfaces.includes('directions'));
  const contact = await page('contact');
  assert.equal(contact.status,200);
  assert.ok(contact.html.includes('src="'+embed+'"') && contact.html.includes('href="'+embed+'"'),'Embed-only publication keeps both visual map and open-map link');
  await sendDesktopProjection(fixture,'pushBusinessContext','business_context',emptyContext);
  await sendDesktopProjection(fixture,'pushRoomCatalog','room_catalog',{version:1,enabled:true,updatedAt:'',rooms:[]});
  assert.equal((await page('rooms')).status,404,'Empty enabled room publication does not create a page');
  checks.push('Real published de/ar feature labels, RTL, missing/stale hash fallback, language withdrawal and independent/empty About groups');
}

async function exerciseTableFields(fixture) {
  const {publish,page,read,checks,desktop} = fixture;
  const caps = ['core.customers','customer.requests','food_service.tables','food_service.reservations'];
  await publish({action:'publish_android_snapshot',snapshot:{business_capabilities:caps}});
  const media = ['cover','photo','panorama_180','panorama_360','video'].map((kind,index)=>({id:'table-media-'+index,kind,
    url:'https://media.example.test/table/'+kind+(kind==='video'?'.mp4':'.jpg'),mimeType:kind==='video'?'video/mp4':'image/jpeg',title:'MEDIA-'+kind,sortOrder:index}));
  const table = {id:'field-table',name:'TABLE-FIELD',area:'TABLE-AREA',capacity:4,description:'TABLE-DESCRIPTION',sortOrder:0,
    features:desktop.normalizeTablePublicFeatures(desktop.TABLE_PUBLIC_FEATURE_CATALOG.map(feature=>feature.id)),smokingPolicy:'unspecified',media};
  for (const policy of desktop.TABLE_SMOKING_POLICIES) {
    await sendDesktopProjection(fixture,'pushTableCatalog','table_catalog',{version:1,enabled:true,updatedAt:'',tables:[{...table,smokingPolicy:policy}]});
    const payload = await read('tables');
    assert.equal(payload.tables[0].smoking_policy,policy);
    assert.deepEqual(payload.tables[0].features,table.features);
    assert.deepEqual(payload.tables[0].media.map(item=>item.url),media.map(item=>item.url));
    const response = await page('restaurant');
    assert.equal(response.status,200);
    const main = mainOf(response.html);
    for (const feature of desktop.TABLE_PUBLIC_FEATURE_CATALOG) assert.ok(main.includes(feature.label));
    for (const [otherPolicy,label] of Object.entries(desktop.TABLE_SMOKING_POLICY_LABELS)) {
      if (label) assert.equal(main.includes('>'+label+'<'),policy===otherPolicy,'Only the published smoking policy appears');
    }
    const detailResponse = await page('restaurant&id='+table.id);
    assert.equal(detailResponse.status,200);
    const detail = mainOf(detailResponse.html);
    for (const item of media) {
      assert.ok(detail.includes(item.url));
      assert.ok(detail.includes('href="'+item.url+'"'),'Every valid media item retains an original-file link');
    }
    assert.ok(detail.includes('data-panorama="panorama_180"') && detail.includes('data-panorama="panorama_360"'));
    assert.ok(/<video\b[^>]*controls[^>]*preload="metadata"/.test(detail));
    assert.ok(!/<video\b[^>]*autoplay/.test(detail));
    assert.ok(detailResponse.html.includes('core/panorama.mjs'));
    assert.ok(main.includes('data-ya-action="food.reserve"'));
    assert.ok(!/class="[^"]*\bempty-state\b/.test((await page('home')).html),'Table-only publication is not reported as empty');
  }
  await sendDesktopProjection(fixture,'pushTableCatalog','table_catalog',{version:1,enabled:true,updatedAt:'',tables:[{...table,features:[],media:[{...media[0],url:'javascript:alert(1)'}]}]});
  const cleared = mainOf((await page('restaurant&id='+table.id)).html);
  assert.ok(!cleared.includes('javascript:') && !cleared.includes('data-panorama=') && !cleared.includes('<video'));
  for (const feature of desktop.TABLE_PUBLIC_FEATURE_CATALOG) assert.ok(!cleared.includes('>'+feature.label+'<'));
  await sendDesktopProjection(fixture,'pushTableCatalog','table_catalog',{version:1,enabled:false,updatedAt:'',tables:[table]});
  const withdrawn = await page('restaurant');
  assert.equal(withdrawn.status,404); assert.ok(!mainOf(withdrawn.html).includes('TABLE-FIELD'));
  await sendDesktopProjection(fixture,'pushTableCatalog','table_catalog',{version:1,enabled:true,updatedAt:'',tables:[]});
  assert.equal((await page('restaurant')).status,404);
  checks.push('Source table transport → API → canonical smoking policies/features/photo/180–360/video, safe clearing and empty/withdrawn publication');
}
