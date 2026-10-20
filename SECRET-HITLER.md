# Secret Hitler no TelinhaFix

Adaptação digital não oficial, com interface original em português, para 5–10 jogadores. O servidor mantém as regras e os segredos; cada cliente recebe somente sua visão autorizada.

## Integração e publicação

Esta versão inclui apenas o jogo integrado ao aplicativo, sem página de prévia ou bots.

1. Atualize o servidor e instale suas dependências com `npm ci` na pasta `server`. Inicie com `npm start`, usando a configuração habitual do projeto.
2. Na pasta `client`, execute `npm ci` e use o processo de compilação e distribuição existente do TelinhaFix. Os arquivos do jogo já estão incluídos pelo padrão `renderer/**/*`.
3. Entre em uma sala com 5–10 pessoas e abra **Minijogos → Secret Hitler → Abrir lobby**. Cada pessoa deve entrar e marcar **Estou pronto** antes de o anfitrião distribuir os papéis.

Cliente e servidor precisam receber a atualização. Instalar somente o cliente não habilita os novos eventos no servidor antigo. A versão do aplicativo e a publicação de uma release ficam a cargo do mantenedor.

## Arquitetura

- `server/games/secret-hitler/engine.js`: regras e transições de estado.
- `server/games/secret-hitler/views.js`: visões públicas e informações privadas por jogador.
- `server/games/secret-hitler/socket.js`: eventos, retomada de sessão e isolamento por sala.
- `server/index.js`: registro do serviço, convites e desconexão.
- `client/preload.js`: ponte de comunicação do jogo.
- `client/renderer/games/secret-hitler.js` e `secret-hitler.css`: tabuleiro, cartas e interface em português.
- `client/renderer/index.html` e `renderer.js`: menu e navegação.

O áudio e o vídeo continuam no fluxo P2P existente. O jogo usa o servidor Socket.IO para arbitrar ações e entregar informações secretas individualmente. O visual é feito com CSS e SVG próprios, sem bibliotecas gráficas adicionais.

## Regras implementadas

- Distribuição de papéis e conhecimento inicial conforme 5–10 participantes.
- Confirmação privada dos papéis, rotação presidencial, elegibilidade e maioria estrita.
- Votos ocultos até todos os jogadores vivos votarem.
- Sessão legislativa com três cartas para o presidente e duas para o chanceler.
- Instabilidade eleitoral, caos sem poder presidencial, reembaralhamento e limites de mandato.
- Investigação de filiação (sem revelar Hitler), consulta ao baralho, eleição especial e execução.
- Veto após cinco políticas fascistas; veto aceito aumenta a instabilidade.
- Todas as condições de vitória; papéis revelados ao terminar.
- Espectadores com visão pública e anfitrião substituído quando se desconecta.

## Reconexão e limites

O token de retomada fica no perfil local, separado por servidor e sala. O servidor guarda apenas seu hash. O nome não autentica um papel. Ao perder a conexão, clique em **Reconectar à sala** no painel do jogo. A partida pausa se um jogador vivo sair; o anfitrião pode encerrá-la sem vencedor. Não há remoção automática de jogador vivo durante uma partida.

Se toda a sala sair, o jogo fica reservado por cinco minutos. Reiniciar o servidor perde as partidas, pois elas ficam em memória, como os outros minijogos. Não há recuperação persistente após reinício nem coordenação entre várias instâncias do servidor.

O servidor é confiável: conhece todos os papéis. A filtragem protege contra outros clientes, não contra o operador do servidor. O painel administrativo recebe apenas a atividade já existente; os segredos de Secret Hitler não são incluídos nele. Executados devem ficar em silêncio por acordo da mesa; os canais gerais de chat/voz externos não são moderados por este jogo.

## Testes

Na pasta `server`, execute `npm test`. A suíte cobre o motor, 120 partidas simuladas, as visões privadas e uma sessão real com vários clientes Socket.IO, incluindo retomada por token, rejeição de comandos antigos, votos duplicados e isolamento entre salas.

## Créditos e licença da adaptação

Secret Hitler foi criado por Mike Boxleiter, Tommy Maranges e Mac Schubert.

- Jogo original: https://www.secrethitler.com/
- Regras de referência: https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf
- Licença: Creative Commons Attribution–NonCommercial–ShareAlike 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/

Esta adaptação inclui um motor digital, comunicação individual de informações secretas, interface em português e retomada de conexão. Não usa as ilustrações originais. Os novos arquivos específicos da adaptação de Secret Hitler são disponibilizados sob CC BY-NC-SA 4.0, sem alterar a licença de componentes anteriores do TelinhaFix ou de suas dependências.
