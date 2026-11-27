# Clientes ativos e inativos na listagem

A tela `/clientes` abre em **Clientes ativos**. A aba **Clientes inativos** permite consultar os cadastros sem movimentação visível no período. Nenhum cadastro ou histórico é excluído ou desativado por essa separação.

O banco integrado atualmente não tem situação administrativa de ativação/desativação em `core.clients`. Por isso, a separação usa movimento comprovado e disponível nas permissões e filtros atuais: apontamentos válidos, faturamento documental unívoco ou recebimentos/despesas operacionais associados a projetos. Clientes com movimentação financeira e sem horas também podem aparecer entre os ativos. A ausência de movimento não é apresentada como desativação cadastral.

O parâmetro `clientActivity=active|inactive` é validado pela API e se aplica exclusivamente à tabela `gestao_clientes`, inclusive no CSV. O predicado roda no SQL antes de busca, ordenação, contagem e paginação. O cache separa cada escopo, e a interface remonta a tabela ao trocar a aba, evitando reaproveitar linhas da aba anterior.

Consultas sem esse parâmetro mantêm o comportamento anterior; detalhes individuais de clientes e outras análises não são restringidos. Os indicadores do módulo mantêm seus escopos originais e não representam a contagem da aba. A URL conserva a visualização (`aba=visao` ou `aba=inativos`).

Stack: React/TypeScript com React Query e Router; Express/TypeScript; consultas PostgreSQL somente para leitura. Nenhuma migration, credencial ou configuração de produção foi alterada.

Validação: testes de consulta e API cobrem ativos/inativos, movimento financeiro sem horas, permissões, períodos, busca, paginação e CSV. A navegação é verificada com PostgreSQL temporário e dados sintéticos, incluindo abas, atualização da página e exportação. Isso não equivale à validação do ambiente de produção.
