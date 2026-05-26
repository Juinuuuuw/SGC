<?php
session_start();
require 'conexao.php';

// Deteta se o pedido é da API Mobile (JSON) ou do Site Web (Formulário POST)
$isApi = isset($_SERVER['CONTENT_TYPE']) && strpos($_SERVER['CONTENT_TYPE'], 'application/json') !== false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    
    if ($isApi) {
        $data = json_decode(file_get_contents("php://input"), true);
        $email = $data['email'] ?? '';
        $senha = $data['senha'] ?? '';
    } else {
        $email = $_POST['email'] ?? '';
        $senha = $_POST['senha'] ?? '';
    }

    if (empty($email) || empty($senha)) {
        if ($isApi) {
            header("Content-Type: application/json; charset=UTF-8");
            echo json_encode(["success" => false, "message" => "Por favor, preencha todos os campos."]);
        } else {
            header("Location: ../login.html?erro=Por favor, preencha todos os campos.");
        }
        exit;
    }

    $stmt = $conn->prepare("SELECT id, id_empresa, id_perfil, nome, senha, ativo FROM usuarios WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $resultado = $stmt->get_result();

    if ($resultado->num_rows === 1) {
        $usuario = $resultado->fetch_assoc();

        // Se a sua senha não estiver encriptada no banco de dados, use: if ($senha === $usuario['senha'] && $usuario['ativo'] == 1)
        if (password_verify($senha, $usuario['senha']) && $usuario['ativo'] == 1) {
            
            $stmt_permissoes = $conn->prepare(
                "SELECT m.identificador FROM permissoes p 
                 JOIN modulos m ON p.id_modulo = m.id 
                 WHERE p.id_perfil = ? AND p.pode_acessar = 1"
            );
            $stmt_permissoes->bind_param("i", $usuario['id_perfil']);
            $stmt_permissoes->execute();
            $permissoes_resultado = $stmt_permissoes->get_result();
            
            $permissoes_array = [];
            while ($permissao = $permissoes_resultado->fetch_assoc()) {
                $permissoes_array[$permissao['identificador']] = true;
            }
            $stmt_permissoes->close();

            $_SESSION['usuario_id'] = $usuario['id'];
            $_SESSION['empresa_id'] = $usuario['id_empresa'];
            $_SESSION['usuario_nome'] = $usuario['nome'];
            $_SESSION['permissoes'] = $permissoes_array;

            if ($isApi) {
                header("Content-Type: application/json; charset=UTF-8");
                echo json_encode([
                    "success" => true, 
                    "usuario" => ["nome" => $usuario['nome'], "email" => $email]
                ]);
            } else {
                header("Location: ../index.html");
            }
            exit;
        }
    }

    if ($isApi) {
        header("Content-Type: application/json; charset=UTF-8");
        echo json_encode(["success" => false, "message" => "Email, senha ou utilizador inválido."]);
    } else {
        header("Location: ../login.html?erro=Email, senha ou usuário inválido.");
    }
    
    $stmt->close();
    $conn->close();
    exit;
}
?>