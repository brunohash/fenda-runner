# FENDA — características atuais

Este arquivo descreve o jogo como ele funciona hoje. Quando uma regra, um número, um mapa ou a interface mudarem, este arquivo muda junto.

FENDA é uma arena 2D no navegador, para até 10 pessoas. O servidor decide o resultado. A movimentação e a escavação usam como referência **conceitual** o corte diagonal à frente e abaixo. O papel do Shaman e o chat na lateral usam como referência **conceitual** um jogo de sobrevivência com um operador especial. Fases, tijolos, porta e o operador são originais. Não é uma reprodução desses jogos.

## Partida

- Contagem de 3 segundos, depois 3 minutos.
- A primeira pessoa que entra na porta adianta o relógio para 30 segundos, se ainda faltava mais do que isso. Quem não entrar nesse tempo perde. Quem entrou vence.
- Essa rodada não mostra tela de resultado. A contagem de 3 segundos do mapa seguinte começa na hora.
- Se todo mundo entra antes dos 30 segundos, a contagem do mapa seguinte também começa na hora.
- Se ninguém entra e o tempo acaba, ou se o Shaman cai, a tela de resultado aparece sem botão e cobre a janela. Ninguém clica para continuar. A próxima rodada espera 5 segundos e começa ao mesmo tempo para quem está na sala. Quando o Shaman cai sozinho, o texto é **SEM UM RESPONSÁVEL** e o próximo é sorteado.
- Até 10 jogadores na sala. A partida começa sozinha quando alguém entra.
- Cinco segundos depois do fim, a próxima rodada começa se ainda houver alguém conectado. Quando a porta encerra a rodada, essa espera não existe.
- Exatamente 1 Shaman e o restante são jogadores. O Shaman é um jogador físico: anda, cai, sobe escada, cava e pode ser eliminado. Ele só entra na porta quando não resta outro jogador vivo.
- A fase jogável de fábrica é a **Claraboia**. Mapas aprovados no editor entram na mesma rotação. O nome aparece ao lado do relógio.

## Objetivo

Todo mundo nasce embaixo. A porta fica no alto. Chegar nela é sair da rodada.

- Encostar na porta marca a pessoa como **saiu**. Ela sai do jogo daquela rodada.
- O Shaman não entra enquanto ainda houver outro jogador vivo. O aviso diz que a porta abre quando não restar outro jogador. Se ele estiver sozinho, no teste do mapa ou depois que os outros saíram ou caíram, a porta o aceita.
- Várias pessoas podem sair. O topo mostra `N/M saíram`.
- A rodada continua enquanto ainda houver alguém vivo correndo.
- Quando a primeira pessoa entra, restam 30 segundos. No fim desse tempo, quem entrou vence e quem ficou perde.
- Quando não resta ninguém vivo antes disso, quem saiu vence e a contagem do mapa seguinte começa.
- Cair para fora do mapa elimina. Não é vitória.
- Se o Shaman morre durante a rodada, a rodada acaba na hora. Quem o derrubou vence essa rodada e será o próximo Shaman. Se ele caiu sozinho ou saiu da sala, o próximo Shaman é sorteado entre quem continua conectado.

## Mapa Claraboia

Grade de 26 por 20 células. Cada célula tem 48 pixels. A câmera mostra o mapa inteiro, sem seguir o personagem, para a porta continuar visível.

- Nascimento na fileira de baixo, acima do vão.
- Porta na fileira de cima, no centro. O desenho é um vão iluminado, com brilho.
- A varanda debaixo da porta é bloco estrutural. Não se cava e o Shaman não a destrói, restaura nem fortifica.
- Rota da esquerda: plataformas mais largas. O lance que entrega na porta apoia em bloco estrutural.
- Rota da direita: plataformas menores. O lance final apoia num tijolo que pode ser cavado.
- As duas rotas chegam na porta sem ajuda do Shaman. O Shaman altera, protege e sabota. Ele não é a única passagem.
- Ponte estreita no meio, feita de tijolos. Cavar o centro abre um poço até o andar de baixo.
- As três fileiras de baixo são vazias. Cair ali elimina.
- Paredes e teto são estruturais.

## Blocos

| Tipo | O que faz |
| --- | --- |
| Vazio | Sem chão. |
| Tijolo | Cava, o Shaman cria, destrói e fortifica. |
| Estrutural | Não se cava e os poderes não o alteram. Rebite escuro. |
| Escada | Não é chão. Só sobe com cima e desce com baixo. O Shaman coloca um degrau num vão vazio. |
| Linha | Não é chão. A pessoa se pendura e atravessa com esquerda e direita. Baixo solta. O Shaman estende uma linha num vão vazio. |

- O buraco fica aberto. Nem a escavação nem o poder Destruir reconstroem o bloco sozinhos.
- O Shaman cria um tijolo em qualquer vão vazio dentro do círculo, com ou sem buraco. Se alguém estiver nesse vão, o bloco não entra.
- Fortificar transforma um tijolo em estrutural até o fim da rodada.
- A escada só existe apoiada em bloco, estrutura ou outro degrau. Sem apoio, o lance inteiro acima cai, e quem estava nele cai junto.

## Movimento e escavação

Todo mundo cava, inclusive o Shaman. A escavação não gasta mana.

- `A` `D` ou setas: andar e virar.
- `W` ou `↑`: subir escada.
- `S` ou `↓`: cavar. Segurar na escada desce, depois do corte daquele toque. Na linha, baixo solta.
- `X`: cavar sem descer.
- Na escada, sem cima nem baixo, a pessoa cai. Encostar na escada não gruda.
- Na linha, as mãos grudam no alto da célula. Esquerda e direita atravessam. Baixo solta, e a pessoa atravessa a linha até as mãos saírem dela. No fim da linha, a queda continua. Escada no mesmo lugar tem prioridade.

O corte acerta o tijolo à frente e um nível abaixo, conforme a direção. Nunca o bloco debaixo dos pés. O cliente manda só a intenção de cavar. O servidor escolhe a célula.

Não cava no ar, desalinhado, em estrutural, em escada, em linha, durante a contagem, nem dentro do cooldown de 700 ms.

Cavar também serve para derrubar outra pessoa, se o alcance diagonal alcançar o bloco em que ela está.

## Shaman

A paleta fica na coluna da direita, junto da loja e do chat, e só aparece para o Shaman. Quem não é Shaman vê o nome dele no topo, junto com o contador de quem saiu.

O botão escolhe a ferramenta. O clique seguinte no mapa escolhe o alvo. `ESC`, ou clicar de novo no poder selecionado, cancela. Com um poder escolhido, a célula sob o mouse fica verde se o alvo vale e vermelha se não vale. Mana insuficiente, recarga e alvo inválido aparecem no botão e na dica. O servidor confirma de novo.

Só o Shaman vê um círculo em volta de si. O raio é o alcance: 240 pixels, cinco células, do centro do Shaman ao centro da célula. O clique fora do círculo não faz efeito.

| Poder | Mana | Recarga | Efeito |
| --- | --- | --- | --- |
| Destruir bloco | 20 | 1 s | Marca o tijolo. Ele continua sólido por 800 ms e depois abre. Não volta sozinho. |
| Criar bloco | 15 | 0,8 s | Coloca um tijolo num vão vazio. Também fecha um buraco. Não cobre quem está no vão. |
| Fortificar bloco | 25 | 1,2 s | O tijolo vira estrutural até o fim da rodada. |
| Escada | 15 | 0,8 s | Coloca um degrau num vão vazio, se houver bloco, estrutura ou escada embaixo. |
| Linha | 15 | 0,8 s | Estende uma linha num vão vazio. Não precisa de apoio. |

- Mana máxima 100. Regenera 10 por segundo. Só os poderes gastam mana.
- A recarga da escavação e a recarga dos poderes são independentes.
- O registro de poderes aceita outros no futuro. Hoje existem estes quatro.

O servidor recusa: falso Shaman, Shaman morto, rodada encerrada, sem mana, em recarga, fora do alcance, bloco que não é tijolo, porta, bloco já marcado, vão ocupado ou com alguém no Criar bloco, escada sem vão ou sem apoio, linha sem vão, e duas solicitações que gastariam a mesma mana.

## Quem derrubou quem

Quando alguém cai porque um bloco sumiu, o servidor guarda a última ação relevante: quem fez, se foi escavação ou poder, qual bloco e quando.

Se a queda elimina dentro de 5 segundos, o crédito é `PLAYER_DIG` ou `SHAMAN_POWER`. A própria pessoa não leva crédito por um buraco que ela mesma abriu debaixo dos próprios pés.

## Interface

- Antes da partida, a tela de conta ocupa a janela: o nome FENDA, a porta dourada no alto e o painel para criar conta ou entrar. O mapa é um vão azul, com tijolo laranja, escada clara e porta dourada. O topo, a coluna da direita e os controles aparecem depois que a sala abre.
- O mapa ocupa a altura entre o topo e os controles. Chat, loja e poderes do Shaman ficam numa coluna à direita, para não comer a altura do jogo.
- Em tela estreita, essa coluna desce para baixo do mapa.
- Topo: tempo, nome da fase, quantos saíram, nome do Shaman, vivos, a lista da sala, **Mapas** e o apelido. Num mapa feito por jogador, o topo também mostra **por** e o apelido de quem criou. A fase de fábrica não tem autor. O apelido do canto abre a própria conta, com e-mail, moedas e **Sair da conta**.
- Clicar num operador abre o perfil dele: retrato, papel nesta rodada e as estatísticas da conta. Partidas, saídas pela porta, vitórias, quedas, vezes como Shaman e moedas. O teste de mapa não entra nessa conta. O e-mail continua só na própria conta.
- O nome da sala fica no topo. O padrão é `Galeria`.
- Chat na coluna da direita, até 48 caracteres. A frase também aparece num balão sobre o personagem, até 32 caracteres, por cerca de 4,5 segundos.
- Há um operador só. O corpo não se escolhe. Andar, subir, cair e se pendurar trocam a pose. O que muda de cor é o item equipado na loja.

## Mapas

- Com a conta aberta, **Mapas** abre o editor. Dá para colocar tijolo, bloco estrutural, escada, linha, uma porta, o nascimento, o começo do Shaman, e apagar. A borda e as três fileiras de baixo ficam fixas: a borda é trava, o vão de baixo continua vazio.
- **Nascer** marca onde a pessoa aparece: no vão, em cima de um bloco, estrutura ou escada. Até 10 pontos. Clicar de novo no mesmo ponto tira ele. Clicar no chão marca o vão logo acima.
- **Shaman** marca um ponto só, no mesmo tipo de vão. O Shaman da rodada começa ali. Sem essa marca, ele nasce num ponto comum. Clicar de novo no ponto tira a marca.
- O mapa começa **reprovado**. Salvar guarda o rascunho. **Testar** coloca o autor sozinho na fase. Chegar na porta aprova e o mapa entra na rotação junto com a Claraboia. Morrer, acabar o tempo ou sair antes da porta mantém reprovado.
- Só o autor altera o próprio mapa, mesmo depois de aprovado. Salvar um aprovado tira ele da rotação e volta a **reprovado** até o teste de novo. Mapa de outra pessoa abre só para olhar. Cada conta guarda até 8 mapas. O teste não paga as 25 moedas da porta.

## Loja

- A conta guarda moedas, o que já foi comprado, o que está equipado e as estatísticas. Isso continua depois que o servidor reinicia. A sessão, não.
- Sair pela porta rende 25 moedas. Cair no vão não rende.
- A loja fica na coluna da direita, acima do chat, em uma grade de três itens por linha. Comprar gasta moedas e já equipa o item. Um clique no item equipado tira ele. Outro item do mesmo encaixe substitui o anterior.
- O servidor recusa item desconhecido, compra repetida e moeda que não alcança o preço.

| Item | Encaixe | Preço | O que muda |
| --- | --- | --- | --- |
| Viseira de cobre | viseira | 30 | A viseira fica cobre |
| Viseira de musgo | viseira | 30 | A viseira fica verde |
| Casco de brasa | casco | 50 | Corpo e capacete puxam para o cobre |
| Casco de vinho | casco | 50 | O corpo fica vinho |
| Lanterna | lanterna | 80 | Uma luz no alto do capacete |
| Faixa de ouro | faixa | 40 | A faixa do peito fica dourada |

## Conta e sala

- Entrar pede apelido, e-mail e senha. A senha fica com hash no arquivo local `server/data/users.json`.
- Sair da conta apaga a sessão neste navegador e no servidor. A pessoa volta para a tela de entrar. Apelido, moedas e itens continuam na conta.
- A sessão vale enquanto o servidor estiver no ar. Reiniciar o servidor desloga todo mundo.
- O nome da sala tem de 2 a 24 caracteres. Quem digita o mesmo nome entra na mesma partida.
- A sala enche em 10 pessoas.

## Onde roda

```bash
npm install
npm test
npm run dev
```

O cliente abre em `http://localhost:5173`. O servidor autoritativo fica em `ws://localhost:8787`.

A simulação anda a 60 quadros por segundo. Cada snapshot manda o mapa inteiro, os buracos, os blocos marcados e o estado dos jogadores. O cliente desenha. Não decide se o bloco quebrou, se a pessoa saiu ou quem venceu.
