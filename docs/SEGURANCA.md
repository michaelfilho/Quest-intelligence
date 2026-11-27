# Segurança

```
navegador ─► Tailscale/Traefik ─► nginx (web) ─────────────► API (Express) ─► PostgreSQL quest_rinne
                                  • real_ip de proxy confiável  • TRUST_PROXY / REQUIRE_PROXY   app      (qi_app)
                                  • allowlist (auth_request)    • allowlist · sessão · CSRF     core,... (qi_reader, somente leitura)
                                  • rate limit, CSP, HSTS       • permissões, escopo, Zod       n8n      (qi_ingest, desligada)
```

## Autenticação

| item | implementação |
|---|---|
| Senhas | Argon2id; mínimo de 12 caracteres; sem senha padrão |
| Primeiro administrador | CLI no servidor; senha temporária exibida uma vez; troca obrigatória |
| Sessão | token de 256 bits só no cookie `rinne_sid` (`HttpOnly`, `SameSite=Strict`, `Secure`, `Path=/core/`); no banco, apenas SHA-256; 30 min de inatividade, 12 h no máximo; sobrevive a reinício; revogável |
| Tentativas por IP | 3 falhas bloqueiam por 15 min e cada repetição triplica; contagem atômica no PostgreSQL |
| Tentativas por usuário | 5 falhas de qualquer IP (em memória) |
| CSRF | header `X-Requested-With: rinne`, `Origin` conferido e `SameSite=Strict` |

## Autorização

Bloqueio por padrão. Permissões efetivas = perfil ∪ concessões − remoções, aplicadas no servidor em módulo, item, coluna e departamento. O frontend só esconde.

## Controle de acesso por IP

Desligado na instalação. Ligado: IP fora da lista recebe **404** no site e na API e aparece como pendente em *Controle de Acesso*. `IP_ALLOWLIST_BOOTSTRAP` é a entrada de emergência. Banco indisponível na leitura da lista: falha fechada.

## Banco

Roles sem superusuário e com o mínimo necessário ([MODELAGEM_POSTGRESQL.md](MODELAGEM_POSTGRESQL.md)); `CONNECT` revogado de `PUBLIC`; auditoria sem `UPDATE`; credencial de migrations fora do ambiente da API; segredos em `deploy/secrets/` (600), fora do Git.

## Auditoria

Logins, bloqueios, alterações de usuários, perfis, sessões, IPs e configurações, exportações e acessos negados. Chaves com nomes de segredos são removidas. Retenção de 365 dias (`AUDIT_RETENTION_DAYS`).

## Limites conhecidos

- Uma instância da API (contador por usuário e cache em memória).
- O limite por usuário permite que terceiros bloqueiem temporariamente uma conta conhecida.
- Superusuários do PostgreSQL continuam podendo conectar: remover credenciais antigas do n8n.
- O dump de backup contém hashes de senha e dados: manter privado.
- Sem proteção própria contra DDoS.
