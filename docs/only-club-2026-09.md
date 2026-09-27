# Only Crew — conta, fidelidade e gestão de admins

A conta proprietária é resolvida pelo e-mail confirmado `okeven.contato@gmail.com` na migração e armazenada por UUID em uma tabela privada. Alterar o e-mail depois não transfere a propriedade. Só ela pode listar todos os usuários e conceder/remover acesso de administrador. O proprietário não pode ser rebaixado; mudanças são registradas em `admin_audit_log`. A checagem lê o banco em cada operação, sem depender de permissões antigas no token.

## Fidelidade

- Uma presença por evento e conta, confirmada por entrada ou uso de Carona, após a data do evento. Múltiplos ingressos e reentradas não multiplicam pontos.
- Ingressos cancelados, reembolsados, bloqueados, reservas sem presença, check-in cuja última ação é `undo` e contas de teste não pontuam.
- Camiseta oversized a cada 5 eventos; moletom a cada 10. Os dois brindes acumulam nos múltiplos de 10. Os números são totais conquistados; a entrega é combinada com a equipe pelo Instagram.
- Desconto para a próxima compra: 0 presenças = 0%; 1 = 5%; 2 = 10%; 3 = 15%; 4 = 20%; 5 a 9 = 30%; 10 = bônus de 40%. Após o pagamento aprovado com o bônus, o ciclo reinicia em zero, preservando o histórico. A presença no evento comprado com bônus inicia o próximo ciclo.
- Limite de um ingresso por conta e evento, incluindo pedidos separados. Em pedidos múltiplos, aplica-se ao ingresso de maior valor. Entre cupom e fidelidade, vale o maior desconto, sem acumular. Reservas pendentes seguram o benefício até pagamento ou cancelamento explícito; expiração sozinha não libera outro uso. O bônus de 40% pendente também segura benefícios em outros eventos.
- A confirmação compara o total mostrado com o total calculado no servidor; mudanças exigem revisar a compra. A seção de administradores tem ordenação por nome ou cadastro e uma lista separada de admins, também presentes na lista geral.
- O amarelo oficial extraído do logotipo é #FFD41F.
- O checkout calcula novamente o benefício no servidor, registra em `ticket_orders.discount_cents` e cobra o valor validado. O ranking só é retornado a administradores.

## Voltar com a loja

Em `assets/js/club-config.js`, mudar `storeEnabled: false` para `true` e atualizar a versão do arquivo nos HTMLs. Isso restaura os templates preservados de loja, produto, carrinho, entrega e pagamento, os atalhos de carrinho e os painéis de pedidos e endereços. Produtos, pedidos, endereços, estoque, integrações e funções de pagamento continuam preservados. A pausa é de interface, conforme solicitado; não é um bloqueio das APIs antigas. A área de conta mantém a nova fidelidade e o histórico de eventos ao restaurar a loja.

## Verificação

- `node tests/club-browser.cjs` com Playwright disponível em NODE_PATH; usa Edge headless por padrão e intercepta todas as chamadas Supabase com dados fictícios. Testa loja pausada/restaurada, conta, fidelidade em 0/4/5/9/10/15/20, mobile, gestão exclusiva, ranking e descontos versus cupons.
- `tests/club-rollback.sql` testa regras reais no banco dentro de uma transação revertida: acesso exclusivo, bloqueio de escalada direta, revogação imediata, marcos até 20 eventos, brindes recorrentes, exclusões e cobrança final. Requer uma conta de QA existente. Nenhum registro dos testes persiste.
- Testes existentes de modalidades e finalização de ingressos e verificador de referências estáticas.

O advisor de segurança não apontou novas funções privilegiadas públicas. A tabela privada do proprietário tem RLS sem políticas intencionalmente (nega acesso direto). Avisos anteriores de funções SECURITY DEFINER existentes e proteção contra senhas vazadas permanecem fora do escopo desta mudança.

- `tests/club-progressive-rollback.sql` verifica as novas faixas, desconto em um ingresso, bloqueio entre pedidos, reserva de bônus, reinício após pagamento, histórico preservado e ordenação/admins. Toda a transação é revertida.
