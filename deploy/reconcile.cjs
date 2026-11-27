// Primeira instalação: como os containers antigos não existem, a referência da configuração é o backup
// privado (saída de "docker inspect"). Nenhum valor de ambiente é lido nem impresso.
const fs = require('node:fs');
const path = require('node:path');
const PROJECT = 'quest-rinne-web';
const MIDDLEWARE = 'quest-rinne-web-tailscale-only';
const PORT = '18372';

/** Procura, em qualquer JSON do backup, os objetos de "docker inspect" dos serviços api e web. */
function findContainers(documents) {
  const found = {};
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 4) return;
    const labels = node.Config?.Labels;
    if (labels?.['com.docker.compose.project'] === PROJECT) {
      const service = labels['com.docker.compose.service'];
      // O mais recente vence quando o backup tem várias capturas.
      if ((service === 'api' || service === 'web') && (!found[service] || String(node.Created) > String(found[service].Created))) found[service] = node;
      return;
    }
    for (const value of Object.values(node)) walk(value, depth + 1);
  };
  for (const doc of documents) walk(doc, 0);
  return found;
}

function referenceFrom(containers, exists = fs.existsSync) {
  for (const service of ['api', 'web']) if (!containers[service]) throw new Error('Backup sem a inspeção do serviço ' + service);
  const list = (name) => [...new Set(['api', 'web'].flatMap((s) => String(containers[s].Config.Labels['com.docker.compose.project.' + name] ?? '').split(',')))]
    .filter((f) => f && f !== '<no value>')
    // Overrides de releases anteriores foram apagados junto com as imagens: não fazem parte da base.
    .filter((f) => !f.includes('/.releases/') && !f.includes('/opt/backups/'));
  const configFiles = list('config_files');
  const envFiles = list('environment_file');
  const workdir = containers.api.Config.Labels['com.docker.compose.project.working_dir'];
  const missing = [...configFiles, ...envFiles, workdir].filter((f) => !f || !exists(f));
  if (!configFiles.length || missing.length) throw new Error('Arquivos Compose da configuração anterior não encontrados: ' + (missing.join(', ') || '(nenhum registrado)'));
  const services = Object.fromEntries(['api', 'web'].map((s) => [s, {
    labels: Object.fromEntries(Object.entries(containers[s].Config.Labels).filter(([k]) => k.startsWith('traefik.'))),
    networks: Object.keys(containers[s].NetworkSettings?.Networks ?? {}).sort(),
  }]));
  return { workdir, configFiles, envFiles, services };
}

/** A configuração que será publicada precisa preservar porta, redes, labels do Traefik e o middleware Tailscale. */
function verifyConfig(config, reference) {
  const problems = [];
  const networkName = (k) => config.networks?.[k]?.name ?? k;
  const labelsOf = (s) => config.services?.[s]?.labels ?? {};
  for (const service of ['api', 'web']) {
    if (!config.services?.[service]) { problems.push('serviço ausente: ' + service); continue; }
    const expected = reference?.services?.[service];
    for (const [key, value] of Object.entries(expected?.labels ?? {})) {
      if (String(labelsOf(service)[key] ?? '').replace(/\$\$/g, '$') !== value) problems.push(`label ${service}/${key} ausente ou diferente`);
    }
    const networks = Object.keys(config.services[service].networks ?? { default: null }).map(networkName);
    for (const network of expected?.networks ?? []) if (!networks.includes(network)) problems.push(`rede ${network} ausente em ${service}`);
  }
  if (!config.services?.api || !Object.keys(config.services.api.networks ?? {}).map(networkName).includes('quest-rinne_private')) problems.push('api fora da rede quest-rinne_private');
  if (!(config.services?.web?.ports ?? []).some((p) => String(p.published) === PORT)) problems.push('web sem a porta ' + PORT);
  if (!JSON.stringify([labelsOf('web'), labelsOf('api')]).includes(MIDDLEWARE)) problems.push('middleware ' + MIDDLEWARE + ' ausente');
  if (config.services?.api?.ports?.length) problems.push('a API não pode publicar portas');
  if (problems.length) throw new Error('Configuração diverge da referência: ' + [...new Set(problems)].join('; '));
}

/** A API precisa receber as credenciais novas e de privilégio mínimo (nunca postgres nem as antigas). */
function verifyDatabaseEnv(config) {
  const env = config.services?.api?.environment ?? {};
  for (const [name, user] of [['DATABASE_URL', 'qi_reader'], ['APP_DATABASE_URL', 'qi_app']]) {
    let actual = '';
    try { actual = new URL(String(env[name])).username; } catch { /* ausente */ }
    if (actual !== user) throw new Error(`${name} efetiva não usa a role ${user}: revisar "environment:" nos arquivos Compose (tem precedência sobre o arquivo de segredos)`);
  }
  if (env.MIGRATION_DATABASE_URL) throw new Error('A credencial de migrations não pode ficar no ambiente da API');
}

function readJsonFiles(root, depth = 0) {
  if (depth > 3) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return readJsonFiles(full, depth + 1);
    if (!entry.name.endsWith('.json') || fs.statSync(full).size > 5e6) return [];
    try { return [JSON.parse(fs.readFileSync(full, 'utf8'))]; } catch { return []; }
  });
}

module.exports = { findContainers, referenceFrom, verifyConfig, verifyDatabaseEnv, readJsonFiles };

// CLI (executado em um container node; só a pasta do backup é montada, em leitura):
//   discover                     lê /reference e imprime caminhos e labels (sem ambiente); a existência
//                                dos arquivos é conferida pelo install.sh no host
//   verify                       lê {config, reference} da entrada padrão
// Com "node -e" os argumentos começam em argv[1]; como arquivo, em argv[2].
const [command] = process.argv.slice(require.main === module ? 2 : 1);
if (command === 'discover' || command === 'verify') {
  try {
    if (command === 'discover') {
      process.stdout.write(JSON.stringify(referenceFrom(findContainers(readJsonFiles('/reference')), () => true)));
    } else {
      const input = JSON.parse(fs.readFileSync(0, 'utf8'));
      verifyConfig(input.config, input.reference);
      verifyDatabaseEnv(input.config);
      process.stdout.write('ok');
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
