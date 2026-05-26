<?php
// api/clientes.php — Gerenciamento de Clientes para o PDV Mobile
require 'conexao.php';
require 'sessao.php';

error_reporting(0);
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
} else {
    header("Access-Control-Allow-Origin: *");
}
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$idEmpresa = $_SESSION['empresa_id'] ?? null;

if (!$idEmpresa) {
    if (ob_get_length()) ob_clean();
    echo json_encode(["success" => false, "message" => "Não autenticado."]);
    exit;
}

if ($method === 'GET') {
    try {
        $search = isset($_GET['search']) ? $conn->real_escape_string($_GET['search']) : '';
        
        $sql = "SELECT id, nome, cpf_cnpj, telefone, email 
                FROM clientes 
                WHERE id_empresa = $idEmpresa";
        
        if (!empty($search)) {
            $sql .= " AND (nome LIKE '%$search%' OR cpf_cnpj LIKE '%$search%' OR telefone LIKE '%$search%')";
        }
        
        $sql .= " ORDER BY nome ASC LIMIT 50";

        $res = $conn->query($sql);
        $clientes = [];
        while ($row = $res->fetch_assoc()) { $clientes[] = $row; }
        
        if (ob_get_length()) ob_clean();
        echo json_encode($clientes);
    } catch (Exception $e) {
        if (ob_get_length()) ob_clean();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data) $data = $_POST;

    $nome     = $conn->real_escape_string($data['nome'] ?? '');
    $cpf_cnpj = $conn->real_escape_string($data['cpf_cnpj'] ?? '');
    $telefone = $conn->real_escape_string($data['telefone'] ?? '');
    $email    = $conn->real_escape_string($data['email'] ?? '');

    if (empty($nome)) {
        if (ob_get_length()) ob_clean();
        echo json_encode(["success" => false, "message" => "Nome é obrigatório."]);
        exit;
    }

    try {
        $sql = "INSERT INTO clientes (id_empresa, nome, cpf_cnpj, telefone, email)
                VALUES ($idEmpresa, '$nome', '$cpf_cnpj', '$telefone', '$email')";

        if ($conn->query($sql)) {
            $id = $conn->insert_id;
            if (ob_get_length()) ob_clean();
            echo json_encode(["success" => true, "id" => $id, "message" => "Cliente cadastrado!"]);
        } else {
            throw new Exception($conn->error);
        }
    } catch (Exception $e) {
        if (ob_get_length()) ob_clean();
        echo json_encode(["success" => false, "message" => "Erro ao cadastrar: " . $e->getMessage()]);
    }
    exit;
}

if (ob_get_length()) ob_clean();
echo json_encode(["success" => false, "message" => "Ação inválida."]);
?>