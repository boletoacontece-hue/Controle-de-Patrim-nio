# Controle de Ativos — Acontece

Sistema interno de controle patrimonial: mobiliário, imobilizado (veículos) e
materiais de limpeza/utensílios, com fotos dos itens, autodeclaração pelo
próprio colaborador e emissão do termo de responsabilidade.

## Arquitetura

| Camada | Tecnologia | Observação |
|---|---|---|
| Banco / API | Supabase (Postgres 15) — schema `ativos` | mesmo padrão do NPS e do Vistoria |
| Autenticação | Supabase Auth + allowlist `usuarios_autorizados` | estar logado não basta |
| Fotos e PDFs | Cloudflare R2 (bucket `acontece-ativos`) | 10 GB grátis, sem custo de saída |
| Front | Vite + React + React Router (HashRouter) | PWA, GitHub Pages via Actions |
| PDF do termo | jsPDF no navegador | carregado sob demanda |

Bundle principal: **74 kB** (19 kB gzip). O jsPDF (449 kB) só é baixado quando
alguém gera um termo — a página pública no celular não paga esse custo.

---

## Instalação

### 1. Banco

No SQL Editor do Supabase, executar **na ordem**:

1. `supabase/migrations/0001_schema.sql` — tabelas, views, triggers, RLS
2. `supabase/migrations/0002_coleta_publica.sql` — convites, submissões, aprovação
3. `supabase/migrations/0003_corrigir_privilegios.sql` — **obrigatória**, ver abaixo
4. `supabase/migrations/0004_corrigir_funcoes_rls.sql` — **obrigatória**, ver abaixo

Depois, cadastrar o primeiro administrador (sem isso ninguém entra):

```sql
insert into ativos.usuarios_autorizados (email, nome, papel)
values ('seu.email@acontece.com', 'Alehandro França', 'admin');
```

O e-mail precisa existir também em Authentication › Users.

### 2. Data API

Integrations › Data API › Settings:

- **Exposed schemas**: acrescentar `ativos` (manter `public`)
- **Extra search path**: acrescentar `ativos`
- **Automatically expose new tables**: **desligar** — as migrations fazem os
  grants explicitamente, e deixar ligado faria tabelas futuras nascerem
  acessíveis ao papel `anon`

### 3. Cloudflare R2

1. Criar bucket `acontece-ativos`
2. Gerar um API Token com permissão de leitura e escrita **apenas nesse bucket**
3. Habilitar domínio público (ou subdomínio próprio, ex.: `ativos.acontece.com.br`)
4. Em Supabase › Edge Functions › Secrets, cadastrar:

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=acontece-ativos
```

5. Publicar a função que assina os uploads:

```bash
supabase functions deploy r2-url-assinada
```

### 4. Front

```bash
npm install
cp .env.example .env    # preencher as três variáveis
npm run dev
```

Deploy: criar o repositório sob a organização `boletoacontece-hue`, cadastrar
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_R2_PUBLIC_URL` em
Settings › Secrets › Actions, e habilitar Pages com origem "GitHub Actions".
O push na `main` publica.

---

## Papéis

| Papel | Ler | Cadastrar/editar | Excluir | Gerir allowlist |
|---|---|---|---|---|
| `admin` | ✔ | ✔ | ✔ | ✔ |
| `gestor` | ✔ | ✔ | — | — |
| `consulta` | ✔ | — | — | — |

Validado com usuário real: fora da allowlist o banco devolve zero linhas e
recusa qualquer escrita.

---

## Autodeclaração pelo colaborador

Cada colaborador recebe um link individual, preenche o que está em seu poder,
anexa fotos e envia. **Quem preenche não lê nada do banco.**

```
Financeiro gera convite  →  link com token individual
        ↓
Colaborador abre, preenche, envia  →  protocolo AD-2026-0001
        ↓
Entra em TRIAGEM (status pendente) — não toca no patrimônio
        ↓
Gestor confere, vincula ao colaborador e aprova
        ↓
Bens criados/vinculados + movimentação de entrega + termo em rascunho
```

### Como a separação de acesso é garantida

O papel `anon` **não tem grant em nenhuma tabela ou view**. Só pode executar
duas funções `SECURITY DEFINER`:

| Função | Devolve |
|---|---|
| `abrir_convite(token)` | apenas nome e setor do destinatário, ou o motivo da recusa |
| `enviar_submissao(...)` | apenas o número de protocolo |

Testado com papel `anon` real: `select` em `bens`, `colaboradores`, `convites`,
`submissoes`, `termos` e `vw_submissoes` retorna `permission denied` em todos os
casos. Não é RLS filtrando linhas — é ausência de privilégio.

### Proteções do endpoint público

| Risco | Proteção |
|---|---|
| Link vazado ou reaproveitado | `usos_max` (padrão 1) e `expira_em` (30 dias) |
| Revogação | flag `revogado`, sem afetar os demais links |
| Clique duplo / rajada | trava de 20 s por convite + `for update` na linha |
| Payload abusivo | máximo 60 itens por envio, 5 fotos por item, campos truncados |
| Upload anônimo abusivo | a Edge Function valida o token antes de assinar e restringe o prefixo a `coleta/` |
| Rastreabilidade sem dado pessoal | IP gravado **apenas como hash SHA-256** |

---

## Termo de responsabilidade

Fiel ao `Modelo_TERMO_DE_USO.docx`: as cláusulas 1 a 4 estão reproduzidas
palavra por palavra (variando apenas concordância quando há mais de um bem).

### Acréscimos ao modelo original

| Acréscimo | Motivo |
|---|---|
| Linha de assinatura do colaborador | **faltava** no modelo; sem ela o termo não prova recebimento |
| Quadro com patrimônio e nº de série | "Painel de LED 70x20" não identifica *qual* painel |
| Estado de conservação na entrega | base para discutir dano na devolução |
| Número do termo e data de emissão | rastreabilidade |
| Hash SHA-256 + QR no rodapé | confere se o PDF é o original |
| Rubrica por página, quando passa de uma folha | impede troca de página depois de assinado |

### Comportamento automático

- **Título**: um item → "DE USO DE VEÍCULO"; vários → "DE USO DE BENS PATRIMONIAIS"
- **Cláusula de software**: só aparece quando há item eletrônico. Termo de mesa
  e cadeira não traz a linha sobre instalação de aplicativos
- **Setor de aviso**: "RH/TI" quando há eletrônico, "RH" nos demais casos
- **Veículo**: bloco técnico (placa, chassi, RENAVAM, hodômetro, licenciamento,
  seguro) e **cláusula 5** com multas, CNH, sinistro e manutenção

> A cláusula 5 foi redigida para este sistema, não veio do modelo original.
> Trata de indicação de condutor junto ao órgão de trânsito e desconto de
> valores — tem implicação trabalhista e convém validar com o jurídico.

### Fluxo

`rascunho` → gerar PDF → `emitido` → imprimir, assinar, digitalizar → anexar →
`assinado`. Sem o digitalizado anexado, o termo permanece em pendências —
regra garantida por constraint no banco, não pelo front.

---

## Decisões de modelagem

**Bens ≠ consumíveis.** Cadeira e carro têm patrimônio e responsável → `bens` +
termo. Detergente tem saldo → `itens_estoque` + `estoque_movimentos` +
requisição. Misturar levaria a emitir termo para meio litro de desinfetante.

**Saldo não é digitado.** `vw_estoque_saldo` deriva o saldo do histórico de
movimentos, então nunca diverge. A flag `abaixo_minimo` alimenta o alerta.

**Situação do bem não é editada à mão.** Só muda por `movimentacoes`, via
trigger. O histórico sempre explica a situação atual — o que se pergunta numa
auditoria.

**Campos específicos em JSONB.** Placa, chassi, RENAVAM e km ficam em
`bens.atributos`, com índice GIN. Uma tabela só, sem dezenas de colunas nulas.

**Item sem etiqueta vira `AD-XXXXXXXXXX`.** Aparece em âmbar na listagem: fica
evidente o que ainda precisa ser plaquetado.

---

## Correção de privilégios (migration 0003)

**Sintoma:** a verificação retornava `anon_pode = true` para **todas** as
funções do schema, inclusive `aprovar_submissao` e os geradores de numeração.

**Causa:** no Postgres, toda função nasce com `EXECUTE` concedido a `PUBLIC`.
Como `anon` e `authenticated` herdam de `PUBLIC`, o `revoke execute ... from
anon` das migrations 0001/0002 **não teve efeito** — o privilégio continuava
chegando pela herança.

**Risco real:** `aprovar_submissao` tem checagem interna de papel, então não
seria de fato executada. Mas `proximo_numero_termo` e `proximo_protocolo` não
têm — alguém com o link público poderia chamá-las em loop e furar a numeração
dos termos, criando buracos na sequência.

**Estado correto após a 0003:**

| função | anon | authenticated |
|---|---|---|
| `abrir_convite` | ✔ | ✔ |
| `enviar_submissao` | ✔ | ✔ |
| `aprovar_submissao` | ✘ | ✔ |
| `proximo_numero_termo` | ✘ | ✔ |
| `proximo_protocolo` | ✘ | ✘ |
| `eh_admin`, `eh_autorizado`, `papel_atual`, `pode_editar` | ✘ | ✘ |
| `tg_*` (triggers) | ✘ | ✘ |

### Lição para os próximos schemas

`revoke ... from anon` é insuficiente em funções. O correto é sempre:

```sql
revoke all on function <assinatura> from public;
grant execute on function <assinatura> to <papel>;
```

E conferir pelo catálogo, não pela interface:

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_pode,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_pode
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'ativos' order by 1;
```

Vale replicar essa correção nos outros projetos (NPS, Vistoria): o
comportamento do Postgres é o mesmo lá.

---

## Views

- `vw_bens_completo` — cadastro com nomes resolvidos e foto principal
- `vw_estoque_saldo` — saldo, valor e alerta de mínimo
- `vw_depreciacao` — depreciação linear (móveis 120 meses, veículos 60)
- `vw_pendencias` — termos sem assinatura, bens com colaborador desligado, estoque em falta
- `vw_submissoes` — fila de triagem com contagem de itens e fotos

## Estrutura

```
supabase/migrations/     three migrations, aplicar em ordem
supabase/functions/      Edge Function que assina uploads no R2
src/lib/supabase.js      cliente e camada de acesso a dados
src/lib/storage.js       compressão de imagem e upload (isola o R2)
src/lib/gerarTermo.js    gerador de PDF do termo
src/pages/               Login, Painel, Bens, Estoque, Termos, Triagem, Convites, Declarar
exemplos/                PDFs de exemplo dos cenários testados
```

Trocar de provedor de storage significa reescrever `src/lib/storage.js` e nada
mais: o banco guarda só a chave do objeto, nunca a URL completa.


---

## Correção das funções de RLS (migration 0004)

**Sintoma:** depois da 0003, **ninguém conseguia entrar**. Qualquer leitura
retornava `permission denied for function eh_autorizado`, mesmo com o e-mail
cadastrado e ativo na allowlist.

**Causa:** um comentário equivocado na própria 0003, que afirmava que as
auxiliares de RLS "são avaliadas dentro das políticas, no contexto do owner,
sem necessidade de grant". **Falso.** No PostgreSQL, expressões de política RLS
são avaliadas com os privilégios de **quem faz a consulta**. Como a 0003
revogou de `PUBLIC` sem devolver para essas quatro, todos ficaram trancados.

**Correção:**

```sql
grant execute on function ativos.eh_autorizado()  to authenticated;
grant execute on function ativos.pode_editar()    to authenticated;
grant execute on function ativos.eh_admin()       to authenticated;
grant execute on function ativos.papel_atual()    to authenticated;
```

Não se concede a `anon`: esse papel não tem privilégio em tabela alguma, então
as políticas nunca chegam a ser avaliadas para ele. Confirmado em teste — as
quatro respondem `permission denied` quando chamadas por `anon`.

As funções não expõem dados de terceiros: todas derivam do e-mail do próprio
JWT de quem chama e devolvem apenas um booleano (ou o papel) sobre si mesmo.

### Validado após a correção

| Cenário | Resultado |
|---|---|
| Admin na allowlist | lê e escreve |
| E-mail fora da allowlist | zero linhas, escrita recusada |
| `anon` nas quatro auxiliares | `permission denied` |
| `anon` lendo tabelas | `permission denied` |
| Coleta pública (abrir + enviar) | funciona, gera protocolo |

### Lição

Conferir a tabela de privilégios não substitui **testar um login real**. Foi o
mesmo descuido que gerou a necessidade da 0003: olhar o catálogo e concluir que
estava certo, sem exercitar o caminho que o usuário percorre.
