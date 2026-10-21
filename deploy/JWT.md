# Configurar o segredo JWT da VM

O workflow manual **Configurar JWT de producao** usa as credenciais SSH já existentes no ambiente `production`. Execute em `main` com `confirmacao=CONFIGURAR_JWT`, apenas após autorização do responsável pelo ambiente.

O segredo é gerado na própria VM com 64 bytes aleatórios criptograficamente seguros, representados em hexadecimal. Não passa por outputs, artefatos, variáveis públicas ou logs do GitHub. O script preenche apenas a variável ausente ou vazia no `.env` privado, preserva um segredo válido existente e recusa valores fracos ou duplicados. Não realiza rotação automática.

Antes da escrita, cria um backup privado `.env.before-jwt.*` na pasta de deploy. A troca do `.env` é atômica, com permissão 0600 e o mesmo lock usado pelo deploy. Nenhuma outra variável é modificada. O workflow não reinicia containers nem modifica o banco.

Depois de configurar, reexecute o workflow Deploy do commit desejado. Para publicar o aplicativo da versão 0.0.1, reexecute o run original 39682964411, associado ao commit a01cda39df3aa09c7673bdf70d6855e89d12b58e. Não altere a tag para incluir o utilitário operacional.

Não cole o conteúdo do `.env` nem o segredo no Jira, em PRs ou no chat. Termos aprovados continuam sendo uma configuração separada; adicionar JWT não habilita cadastro sem documento.
