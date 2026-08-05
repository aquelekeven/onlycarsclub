# E-mails de autenticação da Only Cars Club

## Confirmação de cadastro

- Painel: `Authentication > Email Templates > Confirm signup`
- Assunto: `Confirme seu e-mail — Only Cars Club`
- Corpo: copiar o conteúdo de `confirm-signup.html`

O template usa `{{ .ConfirmationURL }}`, variável oficial do Supabase que confirma o token e encaminha o cliente para a URL definida pelo cadastro.

## URL permitida

Adicionar em `Authentication > URL Configuration > Redirect URLs`:

```text
https://onlycarsclub.com.br/confirmacao-email.html
```

## Remetente com o nome da Only

O servidor padrão continuará exibindo Supabase Auth. Para usar um remetente como `Only Cars Club <no-reply@onlycarsclub.com.br>`, habilitar `Authentication > SMTP Settings` e informar host, porta, usuário e senha de um provedor SMTP com o domínio `onlycarsclub.com.br` verificado.

As credenciais SMTP não devem ser adicionadas ao GitHub ou ao JavaScript do site.
