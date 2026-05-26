<?php
// Inclui a conexão para buscar os módulos
require 'api/conexao.php';

// Busca todos os módulos disponíveis no sistema para montar o formulário
$modulos_resultado = $conn->query("SELECT id, nome FROM modulos ORDER BY nome ASC");
$modulos_disponiveis = [];
if ($modulos_resultado->num_rows > 0) {
    while ($linha = $modulos_resultado->fetch_assoc()) {
        $modulos_disponiveis[] = $linha;
    }
}

$mensagem = '';

// Lógica para processar o formulário quando enviado
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // --- DADOS DA EMPRESA ---
    $nome_empresa = $_POST['nome_empresa'];
    $cnpj_cpf = $_POST['cnpj_cpf'];

    // --- DADOS DO USUÁRIO ADMINISTRADOR (DONO) ---
    $nome_usuario = $_POST['nome_usuario'];
    $email_usuario = $_POST['email_usuario'];
    $senha_usuario = $_POST['senha_usuario'];
    $senha_hash = password_hash($senha_usuario, PASSWORD_DEFAULT);

    // --- DADOS DO PERFIL ADMINISTRADOR ---
    $nome_perfil_admin = $_POST['nome_perfil_admin'];
    $permissoes_admin = $_POST['permissoes_admin'] ?? [];

    try {
        // Inicia uma transação: ou tudo funciona, ou nada é salvo.
        $conn->begin_transaction();

        // 1. Cadastra a nova EMPRESA
        $stmt_empresa = $conn->prepare("INSERT INTO empresas (razao_social, cnpj_cpf) VALUES (?, ?)");
        $stmt_empresa->bind_param("ss", $nome_empresa, $cnpj_cpf);
        $stmt_empresa->execute();
        $id_nova_empresa = $stmt_empresa->insert_id; // Pega o ID da empresa recém-criada
        $stmt_empresa->close();

        // 2. Cadastra o PERFIL de Administrador para essa empresa
        $stmt_perfil = $conn->prepare("INSERT INTO perfis (id_empresa, nome, descricao) VALUES (?, ?, ?)");
        $descricao_perfil = "Perfil com acesso total ao sistema.";
        $stmt_perfil->bind_param("iss", $id_nova_empresa, $nome_perfil_admin, $descricao_perfil);
        $stmt_perfil->execute();
        $id_novo_perfil = $stmt_perfil->insert_id; // Pega o ID do perfil recém-criado
        $stmt_perfil->close();

        // 3. Associa as PERMISSÕES selecionadas ao novo perfil
        $stmt_permissoes = $conn->prepare("INSERT INTO permissoes (id_perfil, id_modulo, pode_acessar) VALUES (?, ?, 1)");
        foreach ($permissoes_admin as $id_modulo) {
            $stmt_permissoes->bind_param("ii", $id_novo_perfil, $id_modulo);
            $stmt_permissoes->execute();
        }
        $stmt_permissoes->close();

        // 4. Cadastra o USUÁRIO Administrador (Dono) associado à empresa e ao perfil
        $stmt_usuario = $conn->prepare("INSERT INTO usuarios (id_empresa, id_perfil, nome, email, senha) VALUES (?, ?, ?, ?, ?)");
        $stmt_usuario->bind_param("iisss", $id_nova_empresa, $id_novo_perfil, $nome_usuario, $email_usuario, $senha_hash);
        $stmt_usuario->execute();
        $stmt_usuario->close();

        // Se todas as etapas ocorreram sem erro, confirma as alterações no banco de dados.
        $conn->commit();
        $mensagem = "<p class='mensagem-sucesso'>Empresa, Perfil de Administrador e Usuário Dono foram criados com sucesso!</p>";

    } catch (mysqli_sql_exception $exception) {
        // Se qualquer etapa falhou, desfaz todas as alterações.
        $conn->rollback();
        $mensagem = "<p class='mensagem-erro'>Erro ao cadastrar: " . $exception->getMessage() . "</p>";
    }
}

$conn->close();
?>

<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Painel de Admin - SGC</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #f0f2f5; color: #333; padding: 20px; }
        .container { max-width: 700px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { text-align: center; color: #1e1e1e; }
        form { display: flex; flex-direction: column; gap: 20px; }
        fieldset { border: 1px solid #ccc; padding: 20px; border-radius: 5px; }
        legend { font-weight: bold; padding: 0 10px; }
        .input-group { display: flex; flex-direction: column; gap: 5px; }
        input[type="text"], input[type="email"], input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        button { background-color: #007bff; color: white; padding: 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; }
        button:hover { background-color: #0056b3; }
        .permissoes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 10px; }
        .permissoes-grid label { display: flex; align-items: center; gap: 8px; font-size: 14px; }
        .mensagem-sucesso { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; text-align: center; }
        .mensagem-erro { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Cadastro de Nova Empresa Cliente</h1>
        <?php echo $mensagem; ?>
        <form method="POST" action="admin.php">
            <fieldset>
                <legend>1. Dados da Empresa</legend>
                <div class="input-group">
                    <label for="nome_empresa">Razão Social</label>
                    <input type="text" id="nome_empresa" name="nome_empresa" required>
                </div>
                <div class="input-group">
                    <label for="cnpj_cpf">CNPJ ou CPF</label>
                    <input type="text" id="cnpj_cpf" name="cnpj_cpf" required>
                </div>
            </fieldset>
            
            <fieldset>
                <legend>2. Perfil de Administrador</legend>
                <div class="input-group">
                    <label for="nome_perfil_admin">Nome do Perfil Principal</label>
                    <input type="text" id="nome_perfil_admin" name="nome_perfil_admin" value="Administrador" required>
                </div>
                <div class="input-group">
                    <label>Permissões para este Perfil:</label>
                    <div class="permissoes-grid">
                        <?php foreach ($modulos_disponiveis as $modulo): ?>
                            <label>
                                <input type="checkbox" name="permissoes_admin[]" value="<?php echo htmlspecialchars($modulo['id']); ?>" checked>
                                <?php echo htmlspecialchars($modulo['nome']); ?>
                            </label>
                        <?php endforeach; ?>
                    </div>
                </div>
            </fieldset>

            <fieldset>
                <legend>3. Usuário Principal (Dono)</legend>
                <div class="input-group">
                    <label for="nome_usuario">Nome do Usuário</label>
                    <input type="text" id="nome_usuario" name="nome_usuario" required>
                </div>
                <div class="input-group">
                    <label for="email_usuario">E-mail de Login</label>
                    <input type="email" id="email_usuario" name="email_usuario" required>
                </div>
                <div class="input-group">
                    <label for="senha_usuario">Senha de Acesso</label>
                    <input type="password" id="senha_usuario" name="senha_usuario" required>
                </div>
            </fieldset>

            <button type="submit">Criar Empresa, Perfil e Usuário</button>
        </form>
    </div>
</body>
</html>
