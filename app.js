(function(){
  var carrito = [];
  var tabActual = 'armas';
  var imgTargetId = null;
  var adminMode = true;
  var metodoSel = null;
  var searchTerm = '';

  // Métodos de pago (editables por el administrador)
  var metodos = [
    {id:'m1', nombre:'PayPal', instrucciones:'Envía el pago a: tucorreo@paypal.com\nLuego envía el comprobante por Discord.'},
    {id:'m2', nombre:'Transferencia bancaria', instrucciones:'Banco: ___\nCuenta: ___\nTitular: ___\nEnvía el comprobante por Discord.'}
  ];

  // ════════════════════════════════════════════════
  //  CAPA DE PERSISTENCIA (IndexedDB)
  //  Guarda catálogo completo: artículos, precios, imágenes
  // ════════════════════════════════════════════════
  var DB_NAME = 'sintonia_db';
  var STORE = 'datos';
  var _db = null;

  function openDB(){
    return new Promise(function(resolve, reject){
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(e){
        var db = e.target.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function(e){ _db = e.target.result; resolve(_db); };
      req.onerror = function(e){ reject(e.target.error); };
    });
  }

  function dbSet(key, value){
    return new Promise(function(resolve, reject){
      if(!_db) return reject('DB no abierta');
      var tx = _db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = function(){ resolve(true); };
      tx.onerror = function(e){ reject(e.target.error); };
    });
  }

  function dbGet(key){
    return new Promise(function(resolve, reject){
      if(!_db) return reject('DB no abierta');
      var tx = _db.transaction(STORE, 'readonly');
      var req = tx.objectStore(STORE).get(key);
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(e){ reject(e.target.error); };
    });
  }

  // Guarda el catálogo y muestra el indicador "✓ Guardado"
  function guardarCatalogo(){
    dbSet('catalogo', catalogo).then(function(){
      var s = document.getElementById('saveStatus');
      if(s){ s.style.opacity = '1'; setTimeout(function(){ s.style.opacity='0'; }, 1500); }
    }).catch(function(err){ console.error('Error guardando:', err); });
    remotePush('catalogo', catalogo);
  }

  function guardarMetodos(){
    dbSet('metodos', metodos).catch(function(err){ console.error('Error guardando métodos:', err); });
    remotePush('metodos', metodos);
  }

  // ════════════════════════════════════════════════
  //  CAPA REMOTA (Supabase) — opcional
  //  Refleja las mismas claves (catalogo/metodos/design)
  //  en una tabla compartida. Si no está configurada,
  //  todo sigue funcionando solo en local (IndexedDB).
  // ════════════════════════════════════════════════
  var SUPA = window.SINTONIA_SUPABASE || {};
  var remoteOn = !!(SUPA.url && SUPA.anonKey && window.supabase);
  var sb = remoteOn ? window.supabase.createClient(SUPA.url, SUPA.anonKey) : null;
  var TABLE = 'tienda_kv';
  if(remoteOn) adminMode = false; // visitante por defecto; se activa al iniciar sesión

  // Resuelve undefined si la promesa tarda demasiado (evita bloqueos por red).
  function withTimeout(promise, ms){
    return new Promise(function(resolve){
      var done = false;
      var t = setTimeout(function(){ if(!done){ done = true; resolve(undefined); } }, ms);
      promise.then(function(v){ if(!done){ done = true; clearTimeout(t); resolve(v); } },
                   function(){ if(!done){ done = true; clearTimeout(t); resolve(undefined); } });
    });
  }
  function remoteGet(key){
    if(!remoteOn) return Promise.resolve(undefined);
    var q = sb.from(TABLE).select('v').eq('k', key).maybeSingle()
      .then(function(res){ return (res && res.data) ? res.data.v : undefined; })
      .catch(function(){ return undefined; });
    return withTimeout(q, 6000);
  }
  // Sube un valor a Supabase. Requiere sesión de administrador (RLS).
  function remotePush(key, value){
    if(!remoteOn) return Promise.resolve(false);
    return sb.from(TABLE).upsert({ k:key, v:value, updated_at:new Date().toISOString() })
      .then(function(res){
        if(res && res.error){ console.warn('No se pudo sincronizar "' + key + '" con la nube:', res.error.message); return false; }
        return true;
      })
      .catch(function(e){ console.warn('Error de red al sincronizar "' + key + '":', e); return false; });
  }
  function cacheLocal(key, value){ dbSet(key, value).catch(function(){}); }

  // ══ DISEÑO: valores por defecto ══
  var defaults = {
    gold:'#E8A020', black:'#0D0D0D', dark:'#141414', dark2:'#1A1A1A', text:'#F0E8D8',
    title:'SINTONIA', titleEm:'ROLEPLAY', sub:'Servidor FiveM · Los Santos',
    spLogo:false, navLogo:true, logoData:null, gifData:null,
    font:'barlow', radius:8,
    navTag:'Tienda Oficial',
    footerText:'© 2026 Sintonia RP · Servidor FiveM · Todos los derechos reservados',
    webhook:''
  };
  var design = Object.assign({}, defaults);

  // Paletas predefinidas
  var presets = [
    {name:'Dorado original', gold:'#E8A020', black:'#0D0D0D', dark:'#141414', dark2:'#1A1A1A', text:'#F0E8D8'},
    {name:'Rojo fuego',      gold:'#E03A2F', black:'#0D0809', dark:'#161011', dark2:'#1E1617', text:'#F0E0E0'},
    {name:'Azul neon',       gold:'#2E9BE8', black:'#080B0D', dark:'#101418', dark2:'#161B20', text:'#E0EAF0'},
    {name:'Verde militar',   gold:'#8FB339', black:'#0C0D08', dark:'#13140E', dark2:'#1A1C13', text:'#EAF0E0'},
    {name:'Morado real',     gold:'#9B59E8', black:'#0B080D', dark:'#131016', dark2:'#1A161E', text:'#EBE0F0'},
    {name:'Cyan tech',       gold:'#1FD6C4', black:'#070D0C', dark:'#0E1615', dark2:'#141E1C', text:'#E0F0EE'}
  ];

  function hexToRgb(h){
    h = h.replace('#','');
    return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
  }
  function shade(hex, pct){
    var c = hexToRgb(hex);
    var f = pct < 0 ? 0 : 255;
    var p = Math.abs(pct);
    return '#' + c.map(function(v){
      var nv = Math.round((f - v) * p + v);
      return ('0' + nv.toString(16)).slice(-2);
    }).join('');
  }

  // Mapa de combinaciones tipográficas
  var fonts = {
    barlow: {display:"'Barlow Condensed',sans-serif", body:"'Barlow',sans-serif"},
    bebas:  {display:"'Bebas Neue',sans-serif",       body:"'DM Sans',sans-serif"},
    space:  {display:"'Space Grotesk',sans-serif",    body:"'Inter',sans-serif"},
    syne:   {display:"'Syne',sans-serif",             body:"'Outfit',sans-serif"},
    oswald: {display:"'Oswald',sans-serif",           body:"'Roboto',sans-serif"}
  };

  // ══ Aplicar diseño al CSS ══
  function applyDesign(){
    var r = document.documentElement.style;
    r.setProperty('--gold', design.gold);
    r.setProperty('--gold-light', shade(design.gold, 0.25));
    r.setProperty('--gold-dark', shade(design.gold, -0.30));
    r.setProperty('--black', design.black);
    r.setProperty('--dark', design.dark);
    r.setProperty('--dark2', design.dark2);
    r.setProperty('--dark3', shade(design.dark2, 0.10));
    r.setProperty('--dark4', shade(design.dark2, 0.30));
    r.setProperty('--text', design.text);

    // Tipografía
    var f = fonts[design.font] || fonts.barlow;
    r.setProperty('--font-display', f.display);
    r.setProperty('--font-body', f.body);

    // Radio de bordes
    r.setProperty('--radius', design.radius + 'px');

    // Textos
    document.getElementById('spTitle').innerHTML = design.title + '<em>' + design.titleEm + '</em>';
    document.getElementById('spSub').innerHTML = design.sub;
    var navTagEl = document.getElementById('navTag'); if(navTagEl) navTagEl.textContent = design.navTag;
    var footEl = document.getElementById('shopFooterText'); if(footEl) footEl.textContent = design.footerText;

    // GIF de fondo personalizado
    if(design.gifData){
      document.querySelector('.bg-gif').src = design.gifData;
      var gt = document.getElementById('gifThumb');
      if(gt){ gt.src = design.gifData; gt.style.display = 'block'; }
    }

    // Logo en portada
    var spLogo = document.getElementById('spLogo');
    var spTitle = document.getElementById('spTitle');
    if(design.spLogo){
      spLogo.style.display = 'block';
      spTitle.style.display = 'none';
    } else {
      spLogo.style.display = 'none';
      spTitle.style.display = 'block';
    }

    // Logo en navbar
    var navLogo = document.getElementById('navLogo');
    if(design.navLogo){
      navLogo.innerHTML = '<img src="' + (design.logoData || 'logo.png') + '" alt="Logo" style="height:32px;filter:drop-shadow(0 0 8px rgba(232,160,32,.4))">';
    } else {
      navLogo.innerHTML = '<span class="nav-logo-text">' + design.title + '</span>';
    }

    // Logo custom en portada
    if(design.logoData){
      document.getElementById('spLogoImg').src = design.logoData;
      document.getElementById('logoThumb').src = design.logoData;
      document.getElementById('logoThumb').style.display = 'block';
    }
  }

  // ══ Sincronizar inputs del panel ══
  function syncInputs(){
    document.getElementById('c-gold').value = design.gold;
    document.getElementById('c-black').value = design.black;
    document.getElementById('c-dark').value = design.dark;
    document.getElementById('c-dark2').value = design.dark2;
    document.getElementById('c-text').value = design.text;
    document.getElementById('hex-gold').textContent = design.gold;
    document.getElementById('hex-black').textContent = design.black;
    document.getElementById('hex-dark').textContent = design.dark;
    document.getElementById('hex-dark2').textContent = design.dark2;
    document.getElementById('hex-text').textContent = design.text;
    document.getElementById('txtTitle').value = design.title;
    document.getElementById('txtTitleEm').value = design.titleEm;
    document.getElementById('txtSub').value = design.sub;
    document.getElementById('toggleSpLogo').checked = design.spLogo;
    document.getElementById('toggleNavLogo').checked = design.navLogo;
    document.getElementById('fontSelect').value = design.font;
    document.getElementById('radiusRange').value = design.radius;
    document.getElementById('radiusVal').textContent = design.radius + 'px';
    document.getElementById('txtNavTag').value = design.navTag;
    document.getElementById('txtFooter').value = design.footerText;
    document.getElementById('txtWebhook').value = design.webhook || '';
    if(design.gifData){ var gt=document.getElementById('gifThumb'); gt.src=design.gifData; gt.style.display='block'; }
  }

  // ══ Guardar / cargar diseño (IndexedDB, soporta GIF grande) ══
  function saveDesign(){
    dbSet('design', design).catch(function(e){ console.error('Error guardando diseño:', e); });
    remotePush('design', design);
  }
  function loadDesignAsync(){
    return dbGet('design').then(function(saved){
      if(saved) design = Object.assign({}, defaults, saved);
    }).catch(function(){});
  }

  // ══ Eventos del panel ══
  function bindColor(inputId, hexId, key){
    var inp = document.getElementById(inputId);
    inp.addEventListener('input', function(){
      design[key] = inp.value;
      document.getElementById(hexId).textContent = inp.value;
      applyDesign();
    });
  }
  bindColor('c-gold','hex-gold','gold');
  bindColor('c-black','hex-black','black');
  bindColor('c-dark','hex-dark','dark');
  bindColor('c-dark2','hex-dark2','dark2');
  bindColor('c-text','hex-text','text');

  document.getElementById('txtTitle').addEventListener('input', function(){design.title=this.value||'SINTONIA';applyDesign();});
  document.getElementById('txtTitleEm').addEventListener('input', function(){design.titleEm=this.value;applyDesign();});
  document.getElementById('txtSub').addEventListener('input', function(){design.sub=this.value;applyDesign();});
  document.getElementById('toggleSpLogo').addEventListener('change', function(){design.spLogo=this.checked;applyDesign();});
  document.getElementById('toggleNavLogo').addEventListener('change', function(){design.navLogo=this.checked;applyDesign();});

  // Nuevos controles: tipografía, radio, textos extra
  document.getElementById('fontSelect').addEventListener('change', function(){design.font=this.value;applyDesign();});
  document.getElementById('radiusRange').addEventListener('input', function(){design.radius=parseInt(this.value);document.getElementById('radiusVal').textContent=this.value+'px';applyDesign();});
  document.getElementById('txtNavTag').addEventListener('input', function(){design.navTag=this.value;applyDesign();});
  document.getElementById('txtFooter').addEventListener('input', function(){design.footerText=this.value;applyDesign();});
  document.getElementById('txtWebhook').addEventListener('input', function(){design.webhook=this.value.trim();});

  // Subir GIF de fondo
  document.getElementById('gifDrop').addEventListener('click', function(){document.getElementById('gifInput').click();});
  document.getElementById('gifInput').addEventListener('change', function(){
    var file = this.files[0]; if(!file) return;
    var reader = new FileReader();
    reader.onload = function(e){ design.gifData = e.target.result; applyDesign(); toast('Fondo (GIF) actualizado'); };
    reader.readAsDataURL(file);
    this.value='';
  });

  // ── Gestión de métodos de pago (panel admin) ──
  function renderMethodsList(){
    var cont = document.getElementById('methodsList');
    if(!metodos.length){ cont.innerHTML = '<p class="dp-hint">No hay métodos aún.</p>'; return; }
    cont.innerHTML = metodos.map(function(m){
      return '<div class="method-item"><span class="mi-name">'+m.nombre+'</span>' +
        '<button class="mi-btn mi-edit" onclick="window.__editMetodo(\''+m.id+'\')">✎</button>' +
        '<button class="mi-btn mi-del" onclick="window.__delMetodo(\''+m.id+'\')">&times;</button></div>';
    }).join('');
  }

  document.getElementById('btnAddMethod').addEventListener('click', function(){
    var nombre = prompt('Nombre del método (ej: PayPal, Nequi, Binance):');
    if(!nombre) return;
    var inst = prompt('Instrucciones / datos de pago para el cliente:') || '';
    metodos.push({id:'m'+Date.now(), nombre:nombre, instrucciones:inst});
    guardarMetodos();
    renderMethodsList();
    toast('Método "'+nombre+'" agregado');
  });

  window.__editMetodo = function(id){
    var m = null; metodos.forEach(function(x){ if(x.id===id) m=x; });
    if(!m) return;
    var nombre = prompt('Nombre del método:', m.nombre);
    if(nombre === null) return;
    var inst = prompt('Instrucciones / datos de pago:', m.instrucciones);
    if(inst === null) return;
    m.nombre = nombre || m.nombre;
    m.instrucciones = inst;
    guardarMetodos();
    renderMethodsList();
    toast('Método actualizado');
  };

  window.__delMetodo = function(id){
    var m = null; metodos.forEach(function(x){ if(x.id===id) m=x; });
    if(!m) return;
    if(!confirm('¿Eliminar el método "'+m.nombre+'"?')) return;
    metodos = metodos.filter(function(x){ return x.id !== id; });
    if(metodoSel === id) metodoSel = null;
    guardarMetodos();
    renderMethodsList();
    toast('Método eliminado');
  };

  // Logo upload
  document.getElementById('logoDrop').addEventListener('click', function(){document.getElementById('logoInput').click();});
  document.getElementById('logoInput').addEventListener('change', function(){
    var file = this.files[0]; if(!file) return;
    var reader = new FileReader();
    reader.onload = function(e){ design.logoData = e.target.result; applyDesign(); toast('Logo actualizado'); };
    reader.readAsDataURL(file);
    this.value='';
  });

  // Presets
  var presetRow = document.getElementById('presetRow');
  presets.forEach(function(p){
    var sw = document.createElement('div');
    sw.className = 'preset';
    sw.title = p.name;
    sw.style.background = 'linear-gradient(135deg,' + p.gold + ' 0%,' + p.gold + ' 50%,' + p.dark + ' 50%,' + p.dark + ' 100%)';
    sw.addEventListener('click', function(){
      design.gold=p.gold; design.black=p.black; design.dark=p.dark; design.dark2=p.dark2; design.text=p.text;
      applyDesign(); syncInputs(); toast('Paleta "' + p.name + '" aplicada');
    });
    presetRow.appendChild(sw);
  });

  // Abrir/cerrar panel
  function openPanel(){ document.getElementById('designPanel').classList.add('open'); document.getElementById('panelBackdrop').classList.add('show'); }
  function closePanel(){ document.getElementById('designPanel').classList.remove('open'); document.getElementById('panelBackdrop').classList.remove('show'); }
  document.getElementById('gearBtn').addEventListener('click', openPanel);
  document.getElementById('dpClose').addEventListener('click', closePanel);
  document.getElementById('panelBackdrop').addEventListener('click', closePanel);
  document.getElementById('dpSave').addEventListener('click', function(){ saveDesign(); toast('Diseño guardado correctamente'); closePanel(); });
  document.getElementById('dpReset').addEventListener('click', function(){
    design = Object.assign({}, defaults);
    dbSet('design', null).catch(function(){});
    document.querySelector('.bg-gif').src = 'fondo.gif';
    document.getElementById('gifThumb').style.display = 'none';
    document.getElementById('logoThumb').style.display = 'none';
    applyDesign(); syncInputs(); toast('Diseño restaurado al original');
  });

  // ══ CATÁLOGO ══
  var catalogo = {
    armas: [
      {id:'a1',nombre:'Pistola 9mm',     desc:'Pistola compacta estándar.',          precio:0,tag:'Basica',  img:null},
      {id:'a2',nombre:'Escopeta',        desc:'Alta potencia en corto alcance.',      precio:0,tag:'Pesada',  img:null},
      {id:'a3',nombre:'Rifle de Asalto', desc:'Rifle automatico de largo alcance.',   precio:0,tag:'Militar', img:null},
      {id:'a4',nombre:'Sniper',          desc:'Precision maxima a larga distancia.',  precio:0,tag:'Elite',   img:null}
    ],
    vehiculos: [
      {id:'v1',nombre:'Muscle Car',     desc:'Potencia y estilo clasico americano.',  precio:0,tag:'Muscle',  img:null},
      {id:'v2',nombre:'Superdeportivo', desc:'Velocidad extrema en las calles.',      precio:0,tag:'Sport',   img:null},
      {id:'v3',nombre:'Moto Custom',    desc:'Libertad sobre dos ruedas.',            precio:0,tag:'Moto',    img:null},
      {id:'v4',nombre:'SUV Blindada',   desc:'Resistencia todo terreno.',             precio:0,tag:'4x4',     img:null}
    ],
    vip: [
      {id:'vip1',rango:'bronze', nombre:'VIP Bronce',  precio:0,perks:['Skin exclusiva','Color en chat','Garage 2 autos'],   popular:false,img:null},
      {id:'vip2',rango:'silver', nombre:'VIP Silver',  precio:0,perks:['Todo Bronce','Vehiculo exclusivo','Rango en foro'],  popular:false,img:null},
      {id:'vip3',rango:'gold',   nombre:'VIP Gold',    precio:0,perks:['Todo Silver','Trabajo premium','Casa propia'],       popular:true, img:null},
      {id:'vip4',rango:'diamond',nombre:'VIP Diamond', precio:0,perks:['Todo Gold','Negocio propio','Acceso staff zone'],    popular:false,img:null}
    ]
  };
  var meta = {
    armas:    {title:'Armas',        desc:'Armamento disponible para tu personaje'},
    vehiculos:{title:'Vehiculos',    desc:'Vehiculos exclusivos para las calles'},
    vip:      {title:'Paquetes VIP', desc:'Beneficios y privilegios en el servidor'}
  };

  document.getElementById('btnEntrar').addEventListener('click', function(){
    document.getElementById('page-splash').style.display = 'none';
    document.getElementById('page-tienda').style.display = 'flex';
    renderTab('armas');
  });

  document.querySelectorAll('.tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active')});
      btn.classList.add('active');
      clearSearch();
      renderTab(btn.getAttribute('data-tab'));
    });
  });

  // ── Buscador de productos ──
  var searchInput = document.getElementById('searchInput');
  var searchBox = searchInput.closest('.search-box');
  function clearSearch(){
    searchTerm = '';
    searchInput.value = '';
    searchBox.classList.remove('has-text');
  }
  searchInput.addEventListener('input', function(){
    searchTerm = this.value.trim().toLowerCase();
    searchBox.classList.toggle('has-text', this.value.length > 0);
    renderTab(tabActual);
  });
  document.getElementById('searchClear').addEventListener('click', function(){
    clearSearch();
    renderTab(tabActual);
    searchInput.focus();
  });

  document.getElementById('btnAgregar').addEventListener('click', function(){
    var nombre = prompt('Nombre del articulo:');
    if(!nombre) return;
    var precio = parseFloat(prompt('Precio en USD:') || 0);
    var desc   = prompt('Descripcion corta:') || '';
    var tag    = prompt('Etiqueta (ej: Nuevo, Sport...):') || 'Nuevo';
    var id = 'u' + Date.now();
    catalogo[tabActual].push({id:id,nombre:nombre,desc:desc,precio:precio,tag:tag,rango:'bronze',perks:[desc],popular:false,img:null});
    renderTab(tabActual);
    guardarCatalogo();
    toast('"' + nombre + '" agregado — haz clic en la imagen para subir foto');
  });

  document.getElementById('btnCarrito').addEventListener('click', function(){
    abrirCarrito();
  });

  document.getElementById('btnSeguir').addEventListener('click', function(){
    document.getElementById('page-carrito').style.display = 'none';
    document.getElementById('page-tienda').style.display = 'flex';
  });

  // Toggle modo administrador / cliente
  document.getElementById('toggleAdmin').addEventListener('change', function(){
    adminMode = this.checked;
    document.getElementById('btnAgregar').style.display = adminMode ? '' : 'none';
    renderTab(tabActual);
    toast(adminMode ? 'Modo administrador activado' : 'Vista de cliente activada');
  });

  // ════════════════════════════════════════════════
  //  AUTENTICACIÓN DE ADMINISTRADOR (Supabase)
  //  Con Supabase: visitantes solo ven/compran; editar
  //  requiere iniciar sesión. Sin Supabase (modo local):
  //  edición siempre disponible, como antes.
  // ════════════════════════════════════════════════
  function refreshAuthUI(user){
    var adminBar = document.querySelector('.admin-bar');
    var adminConfig = document.getElementById('adminConfig');
    if(!remoteOn){
      // Modo local: el dueño edita libremente en su navegador
      document.getElementById('adminAuthSection').style.display = 'none';
      if(adminConfig) adminConfig.style.display = '';
      adminMode = true;
      if(adminBar) adminBar.style.display = '';
      return;
    }
    var loggedIn = !!user;
    document.getElementById('adminAuthSection').style.display = '';
    document.getElementById('authLoggedOut').style.display = loggedIn ? 'none' : '';
    document.getElementById('authLoggedIn').style.display = loggedIn ? '' : 'none';
    // El público NO ve la configuración: solo aparece tras iniciar sesión
    if(adminConfig) adminConfig.style.display = loggedIn ? '' : 'none';
    if(loggedIn) document.getElementById('authWho').textContent = 'Sesión iniciada: ' + (user.email || 'admin');
    adminMode = loggedIn;
    document.getElementById('toggleAdmin').checked = loggedIn;
    if(adminBar) adminBar.style.display = loggedIn ? '' : 'none';
    document.getElementById('btnAgregar').style.display = loggedIn ? '' : 'none';
    renderTab(tabActual);
  }

  function initAuth(){
    if(!remoteOn){ refreshAuthUI(null); return; }
    sb.auth.getSession().then(function(res){
      var s = res && res.data ? res.data.session : null;
      refreshAuthUI(s ? s.user : null);
    });
    sb.auth.onAuthStateChange(function(_e, session){
      refreshAuthUI(session ? session.user : null);
    });
  }

  if(remoteOn){
    document.getElementById('btnLogin').addEventListener('click', function(){
      var email = document.getElementById('authEmail').value.trim();
      var pass = document.getElementById('authPass').value;
      if(!email || !pass){ toast('Ingresa correo y contraseña'); return; }
      var btn = this; btn.disabled = true; btn.textContent = 'Entrando...';
      sb.auth.signInWithPassword({ email:email, password:pass }).then(function(res){
        btn.disabled = false; btn.textContent = 'Iniciar sesión';
        if(res.error){ toast('No se pudo iniciar sesión: ' + res.error.message); return; }
        document.getElementById('authPass').value = '';
        toast('Sesión de administrador iniciada');
      });
    });
    document.getElementById('btnLogout').addEventListener('click', function(){
      sb.auth.signOut().then(function(){ toast('Sesión cerrada'); });
    });
  }

  document.getElementById('imgInput').addEventListener('change', function(){
    var file = this.files[0];
    if(!file || !imgTargetId) return;
    var reader = new FileReader();
    reader.onload = function(e){
      ['armas','vehiculos','vip'].forEach(function(cat){
        catalogo[cat].forEach(function(item){ if(item.id === imgTargetId) item.img = e.target.result; });
      });
      renderTab(tabActual);
      guardarCatalogo();
      toast('Imagen actualizada correctamente');
    };
    reader.readAsDataURL(file);
    this.value = '';
  });

  function pickImg(id){ imgTargetId = id; document.getElementById('imgInput').click(); }

  function renderTab(cat){
    tabActual = cat;
    var m = meta[cat];
    document.getElementById('sectionTitle').textContent = m.title;
    document.getElementById('sectionDesc').textContent  = m.desc;
    var items = catalogo[cat];
    if(searchTerm){
      items = items.filter(function(it){ return (it.nombre||'').toLowerCase().indexOf(searchTerm) !== -1; });
    }
    document.getElementById('sectionBadge').textContent = items.length + (cat==='vip' ? ' planes' : ' articulos');
    if(items.length === 0 && searchTerm){
      document.getElementById('contentArea').innerHTML =
        '<div class="search-empty"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<p>Sin resultados para "' + searchTerm.replace(/</g,'&lt;') + '"</p></div>';
      return;
    }
    if(cat === 'vip'){ renderVip(items); } else { renderItems(items); }
  }

  function overlayHTML(id, hasImg){
    var txt = hasImg ? 'Cambiar imagen' : 'Subir imagen';
    return '<div class="img-overlay" onclick="window.__pickImg(\'' + id + '\')">' +
      '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
      '<span>' + txt + '</span></div>';
  }

  function renderItems(items){
    var html = '<div class="items-grid">';
    items.forEach(function(it){
      var imgInner = it.img
        ? '<img src="' + it.img + '" alt="' + it.nombre + '">'
        : '<div class="no-img"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Sin imagen</span></div>';
      var delBtn = adminMode ? '<button class="item-del" title="Eliminar" onclick="event.stopPropagation();window.__delItem(\'' + it.id + '\',\'' + it.nombre + '\')">&times;</button>' : '';
      var imgClick = adminMode ? 'onclick="window.__pickImg(\'' + it.id + '\')"' : '';
      var imgOverlay = adminMode ? overlayHTML(it.id, !!it.img) : '';
      var actionBtn = adminMode
        ? '<button class="add-btn" onclick="window.__editItem(\'' + it.id + '\')">✎ Editar</button>'
        : '<button class="add-btn" onclick="window.__addCart(\'' + it.id + '\',\'' + it.nombre + '\',' + it.precio + ')">+ Añadir</button>';
      var priceClick = adminMode ? 'title="Clic para editar precio" onclick="window.__editPrice(\'' + it.id + '\')"' : '';
      var priceHint = adminMode ? '<span class="edit-hint">precio ✎</span>' : '';
      html += '<div class="item-card">' +
        '<div class="item-img" ' + imgClick + '>' +
          imgInner + imgOverlay +
          '<div class="item-tag">' + it.tag + '</div>' +
          delBtn +
        '</div>' +
        '<div class="item-body">' +
          '<div class="item-name">' + it.nombre + '</div>' +
          '<div class="item-desc">' + it.desc + '</div>' +
          '<div class="item-footer">' +
            '<div class="item-price" ' + priceClick + '>$' + it.precio + '<span> USD</span>' + priceHint + '</div>' +
            actionBtn +
          '</div>' +
        '</div></div>';
    });
    html += '</div>';
    document.getElementById('contentArea').innerHTML = html;
  }

  function renderVip(items){
    var html = '<div class="vip-grid">';
    items.forEach(function(v){
      var imgInner = v.img
        ? '<img src="' + v.img + '" alt="' + v.nombre + '">'
        : '<div class="vip-fallback ' + v.rango + '">' + v.rango.toUpperCase() + '</div>';
      var perksHtml = v.perks.map(function(p){return '<li>' + p + '</li>'}).join('');
      var vDelBtn = adminMode ? '<button class="vip-del" title="Eliminar" onclick="event.stopPropagation();window.__delItem(\'' + v.id + '\',\'' + v.nombre + '\')">&times;</button>' : '';
      var vImgClick = adminMode ? 'onclick="window.__pickImg(\'' + v.id + '\')"' : '';
      var vImgOverlay = adminMode ? overlayHTML(v.id, !!v.img) : '';
      var vPriceClick = adminMode ? 'title="Clic para editar precio" onclick="window.__editPrice(\'' + v.id + '\')"' : '';
      var vActionBtn = adminMode
        ? '<button class="' + (v.popular ? 'buy-btn' : 'buy-btn-out') + '" onclick="window.__editItem(\'' + v.id + '\')">✎ Editar</button>'
        : '<button class="' + (v.popular ? 'buy-btn' : 'buy-btn-out') + '" onclick="window.__addCart(\'' + v.id + '\',\'' + v.nombre + '\',' + v.precio + ')">Comprar</button>';
      html += '<div class="vip-card' + (v.popular ? ' popular' : '') + '">' +
        '<div class="vip-img" ' + vImgClick + '>' +
          imgInner + vImgOverlay +
          (v.popular ? '<div class="pop-badge">Popular</div>' : '') +
          vDelBtn +
        '</div>' +
        '<div class="vip-body">' +
          '<div class="vip-name">' + v.nombre + '</div>' +
          '<ul class="vip-perks">' + perksHtml + '</ul>' +
          '<div class="vip-foot">' +
            '<div class="vip-price" ' + vPriceClick + '>$' + v.precio + '<span>/mes</span></div>' +
            vActionBtn +
          '</div>' +
        '</div></div>';
    });
    html += '</div>';
    document.getElementById('contentArea').innerHTML = html;
  }

  function toast(msg){
    var t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.classList.add('show');
    setTimeout(function(){t.classList.remove('show')}, 3000);
  }

  window.__pickImg = pickImg;
  window.__addCart = function(id, nombre, precio){
    var ex = null;
    carrito.forEach(function(i){ if(i.id === id) ex = i; });
    if(ex){ ex.qty++; }
    else { carrito.push({id:id, nombre:nombre, precio:precio, qty:1}); }
    actualizarContador();
    toast('+ ' + nombre + ' añadido al carrito');
  };

  function actualizarContador(){
    var n = carrito.reduce(function(s,i){return s + i.qty;}, 0);
    document.getElementById('cartCount').textContent = n;
  }

  // ── Buscar imagen de un artículo para el carrito ──
  function imgDe(id){
    var img = null;
    ['armas','vehiculos','vip'].forEach(function(cat){
      catalogo[cat].forEach(function(it){ if(it.id===id) img = it.img; });
    });
    return img;
  }

  // ── Abrir página del carrito ──
  function abrirCarrito(){
    document.getElementById('page-tienda').style.display = 'none';
    document.getElementById('page-carrito').style.display = 'flex';
    renderCarrito();
    renderPayMethods();
  }

  // ── Render lista del carrito ──
  function renderCarrito(){
    var list = document.getElementById('cartList');
    if(!carrito.length){
      list.innerHTML = '<div class="cart-empty"><svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.6 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg><div class="ce-title">Tu carrito está vacío</div><p>Agrega artículos desde la tienda.</p></div>';
      actualizarTotales();
      return;
    }
    var html = '';
    carrito.forEach(function(it){
      var img = imgDe(it.id);
      var thumb = img ? '<img src="'+img+'" alt="'+it.nombre+'">' : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
      html += '<div class="cart-row">' +
        '<div class="cart-row-thumb">'+thumb+'</div>' +
        '<div class="cart-row-info"><div class="cart-row-name">'+it.nombre+'</div><div class="cart-row-unit">$'+it.precio+' c/u</div></div>' +
        '<div class="qty-ctrl"><button class="qty-btn" onclick="window.__qty(\''+it.id+'\',-1)">−</button><span class="qty-num">'+it.qty+'</span><button class="qty-btn" onclick="window.__qty(\''+it.id+'\',1)">+</button></div>' +
        '<div class="cart-row-price">$'+(it.precio*it.qty)+'</div>' +
        '<button class="cart-row-del" title="Quitar" onclick="window.__quitar(\''+it.id+'\')">&times;</button>' +
        '</div>';
    });
    list.innerHTML = html;
    actualizarTotales();
  }

  function actualizarTotales(){
    var total = carrito.reduce(function(s,i){return s + i.precio*i.qty;}, 0);
    var n = carrito.reduce(function(s,i){return s + i.qty;}, 0);
    document.getElementById('csCount').textContent = n + (n===1?' artículo':' artículos');
    document.getElementById('csSubtotal').textContent = '$' + total;
    document.getElementById('csTotal').textContent = '$' + total + ' USD';
    document.getElementById('btnCheckout').disabled = (n === 0 || metodoSel === null);
  }

  window.__qty = function(id, delta){
    carrito.forEach(function(i){ if(i.id===id) i.qty += delta; });
    carrito = carrito.filter(function(i){ return i.qty > 0; });
    actualizarContador();
    renderCarrito();
  };
  window.__quitar = function(id){
    carrito = carrito.filter(function(i){ return i.id !== id; });
    actualizarContador();
    renderCarrito();
  };

  // ── Render métodos de pago en el carrito ──
  function renderPayMethods(){
    var cont = document.getElementById('payMethods');
    if(!metodos.length){
      cont.innerHTML = '<p style="font-size:12px;color:var(--muted)">El administrador aún no configuró métodos de pago.</p>';
      return;
    }
    cont.innerHTML = metodos.map(function(m){
      var sel = (metodoSel === m.id) ? ' selected' : '';
      return '<div class="pay-method'+sel+'" onclick="window.__selMetodo(\''+m.id+'\')"><div class="pm-radio"></div><div class="pm-name">'+m.nombre+'</div></div>';
    }).join('');
  }

  window.__selMetodo = function(id){
    metodoSel = id;
    renderPayMethods();
    var m = null;
    metodos.forEach(function(x){ if(x.id===id) m = x; });
    var inst = document.getElementById('payInstructions');
    if(m){ inst.textContent = m.instrucciones; inst.classList.add('show'); }
    actualizarTotales();
  };

  // ── Checkout: confirmar pedido ──
  function esWebhookValido(url){
    return /^https:\/\/(discord(app)?\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url || '');
  }

  document.getElementById('btnCheckout').addEventListener('click', function(){
    var btn = this;
    var m = null;
    metodos.forEach(function(x){ if(x.id===metodoSel) m = x; });
    if(!m){ toast('Selecciona un método de pago'); return; }
    var nombre = document.getElementById('csNombre').value.trim();
    if(!nombre){ toast('Escribe tu nombre o ID del servidor'); document.getElementById('csNombre').focus(); return; }
    var contacto = document.getElementById('csContacto').value.trim();
    var total = carrito.reduce(function(s,i){return s + i.precio*i.qty;}, 0);
    var resumen = carrito.map(function(i){return '• '+i.nombre+' x'+i.qty+' — $'+(i.precio*i.qty);}).join('\n');

    function finalizar(){
      alert('¡Pedido confirmado!\n\nCliente: '+nombre+'\n\n'+resumen+'\n\nTotal: $'+total+' USD\n\nMétodo de pago: '+m.nombre+'\n\n'+m.instrucciones);
      carrito = [];
      actualizarContador();
      document.getElementById('page-carrito').style.display = 'none';
      document.getElementById('page-tienda').style.display = 'flex';
    }

    if(esWebhookValido(design.webhook)){
      var prev = btn.textContent;
      btn.disabled = true; btn.textContent = 'Enviando...';
      var payload = {
        username: 'Tienda ' + (design.title || 'Sintonia') + ' RP',
        embeds: [{
          title: '🛒 Nuevo pedido',
          color: 0xE8A020,
          fields: [
            { name: 'Cliente', value: nombre.slice(0,256), inline: true },
            { name: 'Contacto', value: (contacto || '—').slice(0,256), inline: true },
            { name: 'Método de pago', value: m.nombre.slice(0,256), inline: true },
            { name: 'Artículos', value: (resumen || '—').slice(0,1024) },
            { name: 'Total', value: '$' + total + ' USD' }
          ],
          timestamp: new Date().toISOString()
        }]
      };
      fetch(design.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        toast('¡Pedido enviado al staff! Sigue las instrucciones de pago.');
        finalizar();
      }).catch(function(err){
        console.error('Error enviando pedido a Discord:', err);
        toast('No se pudo enviar el pedido. Inténtalo de nuevo.');
      }).finally(function(){
        btn.disabled = false; btn.textContent = prev;
      });
    } else {
      toast('Pedido registrado — sigue las instrucciones de pago');
      finalizar();
    }
  });

  // Editar artículo completo (modal)
  var editingId = null;
  function findItem(id){
    var found = null;
    ['armas','vehiculos','vip'].forEach(function(cat){
      catalogo[cat].forEach(function(it){ if(it.id === id) found = it; });
    });
    return found;
  }

  window.__editItem = function(id){
    var item = findItem(id);
    if(!item) return;
    editingId = id;
    var esVip = tabActual === 'vip' || (item.perks && item.rango);
    var body = document.getElementById('modalBody');
    var html = '';
    html += '<div class="modal-field"><label>Nombre</label><input type="text" id="mf-nombre" value="' + (item.nombre||'').replace(/"/g,'&quot;') + '"></div>';
    if(esVip){
      html += '<div class="modal-field"><label>Beneficios (uno por línea)</label><textarea id="mf-perks" rows="4">' + (item.perks||[]).join('\n') + '</textarea></div>';
      html += '<div class="modal-field"><label>Precio (USD / mes)</label><input type="number" id="mf-precio" value="' + item.precio + '"></div>';
      html += '<div class="modal-field"><label><input type="checkbox" id="mf-popular" ' + (item.popular?'checked':'') + '> Marcar como "Popular"</label></div>';
    } else {
      html += '<div class="modal-field"><label>Descripción</label><textarea id="mf-desc" rows="2">' + (item.desc||'') + '</textarea></div>';
      html += '<div class="modal-field"><label>Etiqueta</label><input type="text" id="mf-tag" value="' + (item.tag||'') + '"></div>';
      html += '<div class="modal-field"><label>Precio (USD)</label><input type="number" id="mf-precio" value="' + item.precio + '"></div>';
    }
    body.innerHTML = html;
    document.getElementById('editModal').classList.add('open');
  };

  function guardarEdicion(){
    var item = findItem(editingId);
    if(!item){ cerrarModal(); return; }
    item.nombre = document.getElementById('mf-nombre').value || item.nombre;
    item.precio = parseFloat(document.getElementById('mf-precio').value) || 0;
    if(document.getElementById('mf-perks')){
      item.perks = document.getElementById('mf-perks').value.split('\n').filter(function(l){return l.trim();});
      item.popular = document.getElementById('mf-popular').checked;
    } else {
      item.desc = document.getElementById('mf-desc').value;
      item.tag = document.getElementById('mf-tag').value || item.tag;
    }
    cerrarModal();
    renderTab(tabActual);
    guardarCatalogo();
    toast('"' + item.nombre + '" actualizado');
  }
  function cerrarModal(){ document.getElementById('editModal').classList.remove('open'); editingId = null; }
  document.getElementById('modalSave').addEventListener('click', guardarEdicion);
  document.getElementById('modalCancel').addEventListener('click', cerrarModal);
  document.getElementById('modalClose').addEventListener('click', cerrarModal);
  document.getElementById('editModal').addEventListener('click', function(e){ if(e.target === this) cerrarModal(); });

  // Editar solo precio (clic rápido en el precio)
  window.__editPrice = function(id){
    var item = findItem(id);
    if(!item) return;
    var nuevo = prompt('Nuevo precio en USD para "' + item.nombre + '":', item.precio);
    if(nuevo === null) return;
    item.precio = parseFloat(nuevo) || 0;
    renderTab(tabActual);
    guardarCatalogo();
    toast('Precio de "' + item.nombre + '" actualizado a $' + item.precio);
  };

  // Eliminar artículo
  window.__delItem = function(id, nombre){
    if(!confirm('¿Eliminar "' + nombre + '"? Esta acción no se puede deshacer.')) return;
    ['armas','vehiculos','vip'].forEach(function(cat){
      catalogo[cat] = catalogo[cat].filter(function(it){ return it.id !== id; });
    });
    renderTab(tabActual);
    guardarCatalogo();
    toast('"' + nombre + '" eliminado');
  };

  // ══ INIT ══
  // Trae los datos compartidos de Supabase en SEGUNDO PLANO y actualiza la
  // vista cuando llegan. Nunca bloquea el render inicial (que usa local).
  function syncFromRemote(){
    if(!remoteOn) return;
    remoteGet('design').then(function(rd){
      if(rd){ design = Object.assign({}, defaults, rd); cacheLocal('design', design); applyDesign(); syncInputs(); }
    });
    remoteGet('metodos').then(function(rm){
      if(rm && rm.length){ metodos = rm; cacheLocal('metodos', metodos); renderMethodsList(); }
    });
    remoteGet('catalogo').then(function(rc){
      if(rc && rc.armas){ catalogo = rc; cacheLocal('catalogo', catalogo); renderTab(tabActual); }
    });
  }

  // Render LOCAL primero (rápido y offline); luego sincroniza con la nube.
  openDB().then(function(){
    return loadDesignAsync();
  }).then(function(){
    applyDesign();
    syncInputs();
    return dbGet('metodos');
  }).then(function(metodosGuardados){
    if(metodosGuardados && metodosGuardados.length){ metodos = metodosGuardados; }
    renderMethodsList();
    return dbGet('catalogo');
  }).then(function(guardado){
    if(guardado && guardado.armas){ catalogo = guardado; }
    renderTab('armas');
    initAuth();
    syncFromRemote();
  }).catch(function(err){
    console.error('Error iniciando, usando valores por defecto:', err);
    applyDesign();
    syncInputs();
    renderMethodsList();
    renderTab('armas');
    initAuth();
    syncFromRemote();
  });
})();
