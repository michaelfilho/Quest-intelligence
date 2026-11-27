// Transformação pura do Compose efetivo. Dados sensíveis só trafegam em arquivos privados na VPS.
const path = require('node:path').posix;
function renderRelease(config, stage, previousImages, revision, reconciled = {}) {
  if(previousImages&&!['api','web'].every(k=>typeof previousImages[k]==='string'&&previousImages[k]))throw new Error('Imagens anteriores incompletas');
  if (!stage.startsWith('/opt/apps/quest-rinne-web-runtime/.releases/') || path.normalize(stage) !== stage) throw new Error('Diretório de release fora do runtime esperado');
  const override = { services: {} };
  for (const service of ['api', 'web']) {
    if (!config.services?.[service]) throw new Error('Serviço esperado ausente: ' + service);
    const s = config.services[service];
    if (previousImages) {
      override.services[service] = { image: previousImages[service] };
      if(service==='api'&&reconciled.api)override.services.api.environment={...reconciled.api};
      continue;
    }
    // Tag própria por release: o build nunca sobrescreve a imagem em uso nem as de rollback.
    override.services[service] = { image: `quest-rinne-release-${service}:${path.basename(stage)}`, build: { context: stage, dockerfile: `${service === 'api' ? 'server' : 'frontend'}/Dockerfile`,
      args: {...(service === 'web' ? { VITE_BASE_PATH: '/core/' } : {}),...(revision?{RINNE_COMMIT_SHA:revision}:{})} } };
    if (!s.environment || Array.isArray(s.environment)) throw new Error('Compose precisa estar normalizado com environment em objeto');
    if (service === 'api') override.services.api.environment = { APP_BASE_PATH: '/core/',...(reconciled.api??{}) };
    // Mounts que substituem código/configuração da imagem exigem merge manual, nunca remoção silenciosa.
    for (const v of s.volumes ?? []) {
      if (typeof v === 'string') throw new Error('Volumes devem estar normalizados pelo docker compose config');
      if (v.type === 'bind' && !v.source.startsWith('/')) throw new Error('Bind mount não absoluto');
      if (['/app', '/app/server', '/app/server/src', '/app/shared', '/usr/share/nginx/html'].includes(v.target)
        || v.target.startsWith('/etc/nginx') || v.target.startsWith('/docker-entrypoint.d')) {
        // htpasswd é configuração de autenticação preservada, não substitui o nginx.
        if (v.target !== '/etc/nginx/htpasswd') throw new Error('Mount de código/nginx requer revisão manual antes de preparar a release: ' + v.target);
      }
    }
    if (s.command || s.entrypoint || s.configs?.length) throw new Error('Command/entrypoint/configs locais exigem revisão manual: ' + service);
  }
  return override;
}
module.exports = { renderRelease };
function verifyRunning(config, containers) {
  const reconciled={};
  for (const service of ['api', 'web']) {
    const running = containers.find(c => c.Config?.Labels?.['com.docker.compose.service'] === service
      && c.Config.Labels['com.docker.compose.project'] === 'quest-rinne-web');
    if (!running) throw new Error('Container/projeto efetivo não comprovado: ' + service);
    const env = Object.fromEntries(running.Config.Env.map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
    if(service==='api'&&Object.hasOwn(env,'RINNE_PUBLISH')&&!Object.hasOwn(config.services.api.environment??{},'RINNE_PUBLISH'))reconciled.api={RINNE_PUBLISH:env.RINNE_PUBLISH};
    for (const [key, value] of Object.entries(config.services[service].environment ?? {})) {
      const input = String(value ?? '');
      if (input !== env[key] && input.replace(/\$\$/g, '$') !== env[key]) {
        // Hotfix explicitamente informado: preservar só o valor efetivo da API.
        // Nenhuma credencial, proxy, porta ou variável do frontend é reconciliada por heurística.
        if(service==='api'&&key==='RINNE_PUBLISH'&&Object.hasOwn(env,key))reconciled.api={RINNE_PUBLISH:env[key]};
        else throw new Error('Ambiente do Compose diverge do container atual; revisar arquivo de ambiente: ' + service + '/' + key);
      }
      config.services[service].environment[key] = env[key];
    }
    for (const v of config.services[service].volumes ?? []) {
      const mounted = running.Mounts.find(m => m.Destination === v.target);
      if (!mounted || (v.type === 'bind' && mounted.Source !== v.source)
        || (v.type === 'volume' && mounted.Name !== (config.volumes?.[v.source]?.name ?? v.source))) throw new Error('Volume efetivo diverge: ' + service + '/' + v.target);
    }
    for (const mounted of running.Mounts) if (!(config.services[service].volumes ?? []).some(v => v.target === mounted.Destination)) throw new Error('Mount atual ausente do Compose: ' + service + '/' + mounted.Destination);
    for (const [key, value] of Object.entries(config.services[service].labels ?? {})) {
      const actual = running.Config.Labels[key];
      if (String(value) !== actual && String(value).replace(/\$\$/g, '$') !== actual) throw new Error('Label efetiva diverge: ' + service + '/' + key);
      config.services[service].labels[key] = actual;
    }
    // Label de roteamento presente no container e ausente do Compose = override esquecido (ex.: Tailscale only).
    for (const key of Object.keys(running.Config.Labels)) {
      if (key.startsWith('traefik.') && !Object.hasOwn(config.services[service].labels ?? {}, key)) throw new Error('Label atual ausente do Compose: ' + service + '/' + key);
    }
    if (running.NetworkSettings?.Networks) {
      const configured = config.services[service].networks ?? {default:null};
      const desired = (Array.isArray(configured) ? configured : Object.keys(configured)).map(k => config.networks?.[k]?.name ?? k).sort();
      if (JSON.stringify(desired) !== JSON.stringify(Object.keys(running.NetworkSettings.Networks).sort())) throw new Error('Redes efetivas divergentes: ' + service);
    }
    if (running.NetworkSettings?.Ports) {
      const ports = config.services[service].ports ?? [];
      const same = (p, key, b) => `${p.target}/${p.protocol ?? 'tcp'}` === key && String(p.published) === b.HostPort
        && (p.host_ip ? p.host_ip === b.HostIp : ['0.0.0.0','::'].includes(b.HostIp));
      for (const p of ports) if (!(running.NetworkSettings.Ports[`${p.target}/${p.protocol ?? 'tcp'}`] ?? []).some(b => same(p, `${p.target}/${p.protocol ?? 'tcp'}`, b))) throw new Error('Porta publicada diverge: ' + service);
      for (const [key, bindings] of Object.entries(running.NetworkSettings.Ports)) for (const b of bindings ?? []) if (!ports.some(p => same(p, key, b))) throw new Error('Porta atual ausente do Compose: ' + service);
    }
  }
  return reconciled;
}
module.exports.verifyRunning = verifyRunning;
const serializeCompose = config => JSON.stringify(config, null, 2).replace(/\$/g, () => '$$');
module.exports.serializeCompose = serializeCompose;
if (process.argv[1] === '--prepare-release') {
  const fs = require('node:fs');
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const reconciled=verifyRunning(input.config, input.containers);
  const config = input.config;
  const parsed = process.argv[3] ? JSON.parse(process.argv[3]) : undefined;
  const previous=parsed&&Object.keys(parsed).length?parsed:undefined;
  const revision=process.argv[4];
  if(revision&&!/^[a-f0-9]{40}$/.test(revision))throw new Error('Hash de release inválido');
  process.stdout.write(serializeCompose(renderRelease(config, process.argv[2], previous,revision,reconciled)));
}
