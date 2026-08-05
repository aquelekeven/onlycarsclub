# Loja integrada — Only Cars Club

Este documento acompanha a migração do fechamento por WhatsApp para uma loja com cadastro opcional, frete calculado e pagamento online.

## Decisões de arquitetura

- O site continua hospedado no GitHub Pages como frontend estático.
- Supabase fornece banco PostgreSQL, autenticação, regras de acesso e Edge Functions.
- Mercado Pago Checkout Pro processa Pix e cartão fora do site, sem expor dados completos de cartão à Only.
- Melhor Envio calcula o frete e gera etiquetas depois da confirmação do pagamento.
- Compra sem cadastro continuará disponível.
- O catálogo e os valores oficiais passam a ser lidos do banco. O navegador nunca define o total final.
- Tokens do Mercado Pago e do Melhor Envio ficam somente nos segredos das Edge Functions.

## Ordem de implantação

- [x] Auditar catálogo, carrinho e fechamento atuais.
- [x] Criar o esquema inicial do Supabase.
- [ ] Criar o projeto de homologação no Supabase.
- [ ] Importar produtos, variantes, preços e estoque.
- [ ] Configurar cadastro, login, recuperação de senha e Google Login.
- [ ] Criar as páginas `entrar`, `cadastro` e `minha-conta`.
- [ ] Refazer entrega e pagamento como um checkout integrado.
- [ ] Implementar a função `quote-shipping` com o Melhor Envio Sandbox.
- [ ] Implementar a função protegida `create-order`.
- [ ] Implementar o Mercado Pago Checkout Pro.
- [ ] Validar webhook e consultar o pagamento na API antes de aprovar o pedido.
- [ ] Criar painel administrativo para pedidos, estoque, pagamentos e envios.
- [ ] Gerar etiqueta somente após conferência administrativa do endereço.
- [ ] Testar compra com e sem cadastro, Pix, cartão, retirada e frete.
- [ ] Publicar depois da aprovação da homologação.

## Painel administrativo

O papel de administrador já faz parte do banco desde a primeira migração. A interface será construída depois que pedidos, pagamentos e fretes tiverem contratos estáveis.

Primeira versão:

- lista e busca de pedidos;
- cliente e endereço;
- itens, variantes e quantidades;
- pagamento e histórico de status;
- modalidade de entrega e cotação escolhida;
- conferência e geração de etiqueta;
- rastreio;
- estoque;
- registro de alterações administrativas.

## Dados necessários antes da integração do frete

- [ ] CEP e endereço completo de postagem.
- [ ] Nome, telefone e e-mail do remetente.
- [ ] CPF ou CNPJ usado na expedição.
- [ ] Peso e dimensões embalados de cada produto ou combinação.
- [ ] Embalagens disponíveis e capacidade de cada uma.
- [ ] Definição sobre nota fiscal ou declaração de conteúdo.
- [ ] Transportadoras e serviços que serão exibidos.

## Pendências para o final do projeto

- [ ] Orçar caixas, envelopes, lacres, etiquetas e demais materiais de expedição.
- [ ] Prioridade zero: recuperação de carrinho abandonado por e-mail, com consentimento e opção de descadastro.

## Segurança obrigatória

- Nenhum token secreto será enviado ao GitHub ou ao JavaScript do navegador.
- Cartões permanecem sob tokenização e proteção do Mercado Pago.
- Pedidos são criados por Edge Function, que recalcula preço, estoque, desconto e frete.
- A página de retorno do pagamento nunca aprova um pedido; somente o webhook validado pode fazer isso.
- Clientes autenticados só podem ler seus próprios pedidos, endereços, pagamentos e envios.
- Alterações administrativas relevantes serão registradas em auditoria.
- Ambiente de homologação e credenciais de teste permanecem separados da produção.
