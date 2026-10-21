# GotAlert 💧

Monitoramento inteligente do consumo de água, com alertas de vazamento e de uso fora do padrão.
Projeto do programa **goIT** (TCS + Marista), ligado ao **ODS 6: Água potável e saneamento**
(dialoga também com os ODS 9, 11 e 12).

> **Resumo:** o software (app, API, banco e detecção de alertas) está funcionando com dados simulados.
> O que falta é principalmente o **hardware real** (módulo com filtro de vela e sensor), alguns recursos
> que dependem de serviços externos (e-mail, notificação com o app fechado) e as etapas do goIT
> (validação com usuários e pitch).

---

## Sumário

1. [Como rodar](#como-rodar)
2. [O que já foi feito](#o-que-já-foi-feito)
3. [O que ainda precisa fazer](#o-que-ainda-precisa-fazer)
4. [Como funciona](#como-funciona)
5. [Estrutura do código](#estrutura-do-código)
6. [API](#api)

---

## Como rodar

Precisa do **Node.js 22.13 ou mais novo** (o banco SQLite já vem embutido no Node).

```bash
npm install        # instala as dependências (só na primeira vez)
npm run seed       # cria a conta de demonstração com 60 dias de consumo
npm start          # sobe o servidor em http://localhost:3000
```

Conta de demonstração: **julia@exemplo.com** / **gotalert123**

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor |
| `npm run dev` | Sobe o servidor e reinicia sozinho quando um arquivo muda |
| `npm run seed` | Apaga e recria só a conta de demonstração |
| `npm run simulate` | Simula o sensor enviando leituras (`-- --leak` adiciona um vazamento) |

### No celular

1. Celular e computador no mesmo Wi-Fi.
2. Abra o endereço `http://<ip-do-computador>:3000` que aparece no terminal ao iniciar o servidor.
3. No Chrome do celular: menu ⋮ → **Adicionar à tela inicial**. O GotAlert abre como app.

> As notificações do sistema (aquelas que aparecem fora do app) exigem HTTPS ou `localhost`.
> Pelo IP da rede local, os alertas aparecem como aviso dentro do app.

### Configuração (opcional)

Copie `.env.example` para `.env` para mudar a porta, o fuso horário ou desligar o modo demonstração
(`DEMO_MODE=false`) quando o sensor de verdade estiver ligado.

---

## O que já foi feito

### Telas do app (front-end)

Feitas a partir das imagens de protótipo da equipe, com a mesma identidade visual.

| Tela | O que tem |
|---|---|
| **Login / Criar conta** | Entrar e cadastrar, mostrar/esconder senha, botão para usar a conta de demonstração |
| **Dashboard** | Consumo de hoje, de ontem e média diária; comparação com ontem **até o mesmo horário**; gráfico hora a hora com as horas fora do padrão em laranja; alerta mais importante em destaque; estado do aparelho; dica do dia |
| **Alertas** | Alertas pendentes (os mais graves primeiro), com período, litros, horário e uma dica do que fazer; histórico com filtros por tipo; botão "Já verifiquei" |
| **Relatórios** | Calendário do mês colorido pelo consumo (com marcação dos dias com alerta); detalhe por hora do dia escolhido; gráfico dos últimos 7 dias com linha da média; consumo do mês por semana; total, média, dia de maior consumo e comparação com o mês anterior |
| **Meu dispositivo** *(nova)* | Conectado ou sem sinal; chave do aparelho (mostrar, copiar, gerar nova); quanto falta para **limpar a vela** e **esvaziar o reservatório**, com botão para registrar a manutenção; endereço de instalação; passo a passo de instalação; botões de demonstração |
| **Configurações** | Dados do usuário, troca de senha, notificações (anormal, celular, e-mail) e regras dos alertas |

Também:

- **Funciona no celular e no computador:** menu lateral no computador, barra inferior no celular.
- **PWA:** pode ser instalado na tela inicial do celular e abre como app.
- **Avisos em tempo (quase) real:** o app consulta a API a cada 15 s. Quando chega alerta novo, aparece um aviso na tela e, se permitido, uma notificação do sistema.
- **Logo em SVG** (gota com exclamação, ondas e mãos), no app e no ícone do celular.
- **Paleta da equipe** + um azul mais escuro proposto (`#02075E`), usado no menu lateral.

### Servidor e API (back-end)

- **Node.js + Express**, com banco **SQLite** (arquivo em `data/gotalert.db`).
- **Login com token (JWT)**, senhas salvas com hash (bcrypt) e validação de todos os campos, com mensagens em português.
- **API do sensor** separada, autenticada pela chave do aparelho (`X-Device-Key`). Aceita uma leitura ou um lote, e um "sinal de vida" para mostrar o aparelho conectado mesmo sem consumo.
- **Um único módulo por casa**, seguindo a diretriz do produto.
- Todos os números (hoje, ontem, semana, mês, médias) são **calculados das mesmas leituras**. Por isso as inconsistências das imagens geradas por IA não existem no sistema.

### Detecção de alertas

Roda a cada leitura recebida. Todos os valores podem ser ajustados em **Configurações**.

| Alerta | Quando dispara (padrão) |
|---|---|
| **Possível vazamento** | Água correndo sem parar por 60 min ou mais |
| **Consumo de madrugada** | 20 L ou mais entre 0h e 5h |
| **Acima da média** | Dia passa 15% da média dos últimos 14 dias (precisa de 7 dias de histórico) |
| **Limite diário** | Dia passa o limite definido pelo usuário (opcional) |
| **Manutenção** | 90% da capacidade estimada da vela ou do reservatório |

Um alerta nunca é repetido para o mesmo evento: ele é atualizado enquanto o evento continua.
Quando o consumo de madrugada vira possível vazamento, o aviso de madrugada sai da lista de pendentes.

### Demonstração e testes

- **Dados de demonstração** (`npm run seed`): 60 dias de uma casa simulada, com o exemplo do projeto
  (média entre 560 e 620 L e um dia com 720 L, com água correndo entre **3h23 e 6h44**),
  além de um dia de mangueira no jardim, uma descarga com defeito de madrugada e o reservatório quase cheio.
  **Esses números são simulados, não são medições reais.**
- **Modo demonstração no app:** em *Meu dispositivo*, os botões *Simular banho*, *Simular vazamento* e
  *Simular uso de madrugada* geram leituras na hora. É o jeito mais fácil de mostrar um alerta ao vivo no pitch.
- **Simulador do sensor** (`npm run simulate`): se comporta como o ESP32, enviando leituras de tempos em tempos.
- **Conferido manualmente:** todos os endpoints da API (incluindo erros como chave inválida, JSON quebrado
  e senha curta) e todas as telas no Chrome, em tamanho de computador e de celular, sem erros no console.

### Mudanças em relação às imagens de protótipo

- Números consistentes entre todas as telas.
- Gráfico do dia com as **24 horas**, para mostrar o consumo de madrugada.
- "X% a menos que ontem" no card de **hoje** e comparando até o mesmo horário.
- Calendário com legenda.
- **CPF removido** do cadastro: o app não precisa dele (princípio da LGPD de coletar só o necessário).
- Endereço de demonstração fictício.
- Notificação no celular, além da notificação por e-mail.
- Nova tela **Meu dispositivo**, para o filtro de vela aparecer no app.

---

## O que ainda precisa fazer

### Hardware (prioridade alta)

- [ ] **Montar o protótipo físico** do módulo único: filtro de vela + reservatório de resíduos + sensor de vazão.
- [ ] **Escolher o sensor de vazão** e **calibrar** o fator pulsos → litros (vem do datasheet do modelo e precisa ser conferido com medição real).
- [ ] **Programar o ESP32** (ou outra placa): contar pulsos, somar os litros de cada minuto, enviar para `/api/ingest/readings` e mandar o sinal de vida (`/api/ingest/heartbeat`). Há um exemplo de código no fim deste arquivo.
- [ ] **Configurar o Wi-Fi e a chave do aparelho no módulo** (hoje não existe uma tela de configuração no próprio módulo).
- [ ] **Medir as capacidades reais:** quantos litros até precisar limpar a vela e até esvaziar o reservatório. Os valores atuais (20.000 L e 7.000 L) são estimativas para o protótipo e podem ser alterados em *Meu dispositivo → Capacidades*.
- [ ] Pensar na **alimentação** (tomada ou bateria) e na **proteção contra água** da parte eletrônica.

### Etapas do goIT

- [ ] **Design Thinking:** validar o app com pessoas reais (entrevistas, teste das telas) e registrar o que mudou depois disso.
- [ ] **Justificativa dos ODS** com dados de fontes confiáveis (não usar os números simulados do app como se fossem reais).
- [ ] **Roteiro do pitch**, usando o modo demonstração para mostrar um alerta ao vivo.
- [ ] **Decidir o azul mais escuro** da paleta (proposta atual: `#02075E`).

### Recursos que dependem de serviços externos

- [ ] **Envio de e-mail de verdade:** hoje é simulado (aparece no console do servidor). Precisa de um serviço SMTP.
- [ ] **Notificação com o app fechado (Web Push):** precisa de HTTPS e chaves VAPID. Hoje a notificação só funciona com o app aberto.
- [ ] **"Esqueci minha senha":** depende do envio de e-mail.
- [ ] **Hospedar na internet com HTTPS**, se o projeto for publicado (hoje roda só na rede local).

### Qualidade e segurança

- [ ] **Testes automatizados** (hoje os testes foram manuais).
- [ ] **Limite de tentativas de login** para dificultar ataques de força bruta.
- [ ] **Termos de uso e política de privacidade** (LGPD), se houver usuários reais.
- [ ] **Backup do banco** (`data/gotalert.db`).
- [ ] Revisão de **acessibilidade** (leitor de tela, contraste) e, se desejado, **modo escuro**.

### Ideias para o futuro

- [ ] Mais de um módulo por casa (hoje é um só, seguindo a diretriz de simplicidade).
- [ ] Relatório semanal ou mensal enviado ao usuário.
- [ ] Metas de economia e comparação com o mês anterior em destaque.
- [ ] Válvula para fechar a água automaticamente ao detectar vazamento (avaliar se não complica o produto).

### Observação sobre a pasta

O projeto está dentro do **OneDrive**, e a pasta `node_modules` tem muitos arquivos, o que pode deixar
a sincronização lenta. Se incomodar, mova o projeto para fora do OneDrive ou use Git (o `.gitignore`
já ignora `node_modules/` e `data/`).

---

## Como funciona

```
[Sensor de vazão no módulo] --(HTTP: litros por minuto)--> [API Node/Express] --> [SQLite]
                                                                  |
                                              detecção de alertas a cada leitura
                                                                  |
                                       [App web / PWA] <-- consulta a cada 15 s
```

Cada leitura representa os litros que passaram pelo sensor durante **um minuto**. Leituras seguidas
(com no máximo 1 minuto sem fluxo entre elas) formam um "uso contínuo"; é assim que o sistema percebe
um vazamento.

---

## Estrutura do código

```
server/
  index.js            servidor Express (API + arquivos do app)
  config.js           configurações (.env)
  db.js               banco SQLite e tabelas
  auth.js             login com JWT e autenticação do sensor
  http.js             erros e validação dos campos
  models.js           conversão do banco para o formato da API
  time.js             datas, horas e formatação
  routes/             endpoints da API (auth, me, device, consumption, alerts, ingest)
  services/alerts.js  detecção de vazamento e consumo anormal
  services/stats.js   totais por hora, dia e média
  services/device.js  gravação das leituras e saúde do aparelho
scripts/
  seed.js             dados de demonstração
  simulator.js        simulador do sensor
public/               front-end (HTML, CSS e JavaScript sem framework)
  index.html          página única do app
  css/styles.css      identidade visual e layout
  js/app.js           navegação, menu e verificação de alertas
  js/pages/           uma tela por arquivo
  js/charts.js        gráficos de barras em SVG
  manifest.webmanifest, sw.js   instalação no celular (PWA) e notificações
```

---

## API

Todas as respostas são JSON. Erros vêm como `{ "error": "mensagem" }`.

### Sensor (cabeçalho `X-Device-Key: GA-XXXX-XXXX`)

| Método | Rota | Corpo |
|---|---|---|
| POST | `/api/ingest/readings` | `{ "liters": 2.5 }` ou `{ "readings": [{ "ts": 1730000000000, "liters": 2.5 }] }` |
| POST | `/api/ingest/heartbeat` | vazio, só avisa que está ligado |

`ts` é opcional (em milissegundos ou ISO 8601); sem ele, o servidor usa a hora atual.
São aceitas até 1.440 leituras por envio, com no máximo 60 L por minuto cada e até 30 dias atrás.

### App (cabeçalho `Authorization: Bearer <token>`)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/auth/config` | informa se o modo demonstração está ligado |
| POST | `/api/auth/register` | `{ name, email, password }` cria a conta e devolve o token |
| POST | `/api/auth/login` | `{ email, password }` devolve o token |
| GET | `/api/me` | usuário e configurações |
| PATCH | `/api/me` | `{ name, email, phone }` |
| PATCH | `/api/me/password` | `{ current, next }` |
| PATCH | `/api/settings` | regras e notificações (só os campos enviados) |
| GET / POST / PATCH | `/api/device` | ver, cadastrar e editar o módulo |
| POST | `/api/device/filter-cleaned` | registra a limpeza da vela |
| POST | `/api/device/reservoir-emptied` | registra que o reservatório foi esvaziado |
| POST | `/api/device/key` | gera uma nova chave para o sensor |
| POST | `/api/device/simulate` | `{ scenario: "shower" \| "leak" \| "night" }` (só no modo demonstração) |
| GET | `/api/consumption/summary` | dados do dashboard |
| GET | `/api/consumption/day?date=AAAA-MM-DD` | consumo por hora em um dia |
| GET | `/api/consumption/week?end=AAAA-MM-DD` | 7 dias |
| GET | `/api/consumption/month?month=AAAA-MM` | dias, semanas, total e comparação |
| GET | `/api/alerts` | `?type=leak&unread=true&after=<id>&limit=50` |
| GET | `/api/alerts/status` | quantidade não lida e id mais recente |
| POST | `/api/alerts/:id/read` · `/api/alerts/read-all` | marcar como verificado |

### Exemplo para o ESP32 (Arduino)

```cpp
// O sensor de vazão (ex.: YF-S201) gera pulsos; o fator de conversão pulsos -> litros
// vem do datasheet do modelo usado e deve ser calibrado (a verificar).
HTTPClient http;
http.begin("http://192.168.0.10:3000/api/ingest/readings");
http.addHeader("Content-Type", "application/json");
http.addHeader("X-Device-Key", "GA-XXXX-XXXX");
http.POST("{\"liters\": " + String(litrosNoUltimoMinuto) + "}");
http.end();
```
