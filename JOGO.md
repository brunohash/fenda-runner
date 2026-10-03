# FENDA — características atuais

Este arquivo descreve o jogo como ele funciona hoje. Quando uma regra, um número, um mapa ou a interface mudarem, este arquivo muda junto.

FENDA é uma arena 2D no navegador, para até 10 pessoas. O servidor decide o resultado. A movimentação e a escavação usam como referência **conceitual** o corte diagonal à frente e abaixo. O papel do Shaman e o chat embaixo usam como referência **conceitual** um jogo de sobrevivência com um operador especial. Fases, tijolos, porta e personagens são originais. Não é uma reprodução desses jogos.

## Partida

- Contagem de 3 segundos, depois 3 minutos.
- Até 10 jogadores na sala. A partida começa sozinha quando alguém entra.
- Cinco segundos depois do fim, a próxima rodada começa se ainda houver alguém conectado.
- Exatamente 1 Shaman e o restante são jogadores. O Shaman é um jogador físico: anda, cai, sobe escada, cava, pode sair pela porta e pode ser eliminado.
- A fase jogável é a **Claraboia**. O nome aparece ao lado do relógio.

## Objetivo

Todo mundo nasce embaixo. A porta fica no alto. Chegar nela é sair da rodada.

- Encostar na porta marca a pessoa como **saiu**. Ela sai do jogo daquela rodada.
- Várias pessoas podem sair. O topo mostra `N/M saíram`.
- A rodada continua enquanto ainda houver alguém vivo correndo.
- Quando não resta ninguém vivo, quem saiu vence. Uma pessoa só: vitória. Várias: empate entre quem saiu.
- Se o tempo acaba e alguém saiu, vencem quem saiu. Se ninguém saiu, vale quem ainda está vivo: um vivo vence; mais de um é empate.
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
| Tijolo | Cava, o Shaman destrói, restaura e fortifica. |
| Estrutural | Não se cava e os poderes não o alteram. Rebite escuro. |
| Escada | Não é chão. Só sobe com cima e desce com baixo. |

- O buraco fica aberto. Nem a escavação nem o poder Destruir reconstroem o bloco sozinhos.
- O tijolo só volta quando o Shaman usa **Restaurar bloco**.
- Se alguém estiver dentro do bloco no momento em que ele volta, essa pessoa é eliminada.
- Fortificar transforma um tijolo em estrutural até o fim da rodada.
- A escada só existe apoiada em bloco, estrutura ou outro degrau. Sem apoio, o lance inteiro acima cai, e quem estava nele cai junto.

## Movimento e escavação

Todo mundo cava, inclusive o Shaman. A escavação não gasta mana.

- `A` `D` ou setas: andar e virar.
- `W` ou `↑`: subir escada.
- `S` ou `↓`: cavar. Segurar na escada desce, depois do corte daquele toque.
- `X`: cavar sem descer.
- Na escada, sem cima nem baixo, a pessoa cai. Encostar na escada não gruda.

O corte acerta o tijolo à frente e um nível abaixo, conforme a direção. Nunca o bloco debaixo dos pés. O cliente manda só a intenção de cavar. O servidor escolhe a célula.

Não cava no ar, desalinhado, em estrutural, em escada, durante a contagem, nem dentro do cooldown de 700 ms.

Cavar também serve para derrubar outra pessoa, se o alcance diagonal alcançar o bloco em que ela está.

## Shaman

A paleta fica à direita do chat e só aparece para o Shaman. Quem não é Shaman vê o nome dele no topo, junto com o contador de quem saiu.

O botão escolhe a ferramenta. O clique seguinte no mapa escolhe o alvo. `ESC`, ou clicar de novo no poder selecionado, cancela. Com um poder escolhido, o bloco sob o mouse fica verde se o alvo vale e vermelho se não vale. Mana insuficiente, recarga e alvo inválido aparecem no botão e na dica. O servidor confirma de novo.

Os três poderes usam o mesmo alcance: 240 pixels, cinco células, do centro do Shaman ao centro do bloco.

| Poder | Mana | Recarga | Efeito |
| --- | --- | --- | --- |
| Destruir bloco | 20 | 1 s | Marca o tijolo. Ele continua sólido por 800 ms e depois abre. Não volta sozinho. |
| Restaurar bloco | 15 | 0,8 s | Fecha um buraco na hora. |
| Fortificar bloco | 25 | 1,2 s | O tijolo vira estrutural até o fim da rodada. |

- Mana máxima 100. Regenera 10 por segundo. Só os poderes gastam mana.
- A recarga da escavação e a recarga dos poderes são independentes.
- O registro de poderes aceita outros no futuro. Hoje só estes três existem.

O servidor recusa: falso Shaman, Shaman morto, rodada encerrada, sem mana, em recarga, fora do alcance, bloco que não é tijolo, porta, bloco já marcado, buraco inexistente no Restaurar, e duas solicitações que gastariam a mesma mana.

## Quem derrubou quem

Quando alguém cai porque um bloco sumiu, o servidor guarda a última ação relevante: quem fez, se foi escavação ou poder, qual bloco e quando.

Se a queda elimina dentro de 5 segundos, o crédito é `PLAYER_DIG` ou `SHAMAN_POWER`. A própria pessoa não leva crédito por um buraco que ela mesma abriu debaixo dos próprios pés.

## Interface

- Topo: tempo, nome da fase, quantos saíram, nome do Shaman, vivos e a lista da sala.
- O nome da sala fica no topo. O padrão é `Galeria`.
- Chat embaixo, até 48 caracteres. A frase também aparece num balão sobre o personagem, até 32 caracteres, por cerca de 4,5 segundos.
- Em tela estreita, a paleta do Shaman desce para baixo do chat em vez de cobrir o mapa.
- Personagens originais, escolhidos na conta e trocáveis depois: Lume, Brasa, Nico, Voga, Iris e Cabo. A conta guarda o id, que é o gancho para um marketplace futuro. Não há sprites de terceiros.

## Conta e sala

- Entrar pede apelido, e-mail e senha. A senha fica com hash no arquivo local `server/data/users.json`.
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
