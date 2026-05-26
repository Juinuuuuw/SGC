<?php
session_start();

// Verifica se o ficheiro foi acedido DIRETAMENTE (ex: pelo Javascript da Web)
if (basename($_SERVER['PHP_SELF']) === 'sessao.php') {
    header('Content-Type: application/json; charset=UTF-8');
    header("Access-Control-Allow-Origin: *");
    
    if (isset($_SESSION['usuario_id']) && isset($_SESSION['empresa_id'])) {
        echo json_encode([
            'logado' => true,
            'usuario_id' => $_SESSION['usuario_id'],
            'empresa_id' => $_SESSION['empresa_id'],
            'usuario_nome' => $_SESSION['usuario_nome'],
            'permissoes' => $_SESSION['permissoes'] ?? []
        ]);
    } else {
        http_response_code(401); 
        echo json_encode([
            'logado' => false,
            'message' => 'Nenhum utilizador com sessão iniciada.'
        ]);
    }
    exit;
}
// Se for incluído noutro ficheiro (via require), apenas inicia a sessão silenciosamente.
?>