<?php
require 'conexao.php';
require 'sessao.php';

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
} else {
    header("Access-Control-Allow-Origin: *");
}
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$idEmpresa = $_SESSION['empresa_id'] ?? null;

if (!$idEmpresa) {
    ob_clean();
    echo json_encode(["success" => false, "message" => "Empresa não identificada na sessão."]);
    exit;
}

switch ($method) {
    case 'GET':
        $sql = "SELECT * FROM fornecedores WHERE id_empresa = $idEmpresa ORDER BY id DESC";
        $resultado = $conn->query($sql);
        $fornecedores = [];
        while ($row = $resultado->fetch_assoc()) {
            $fornecedores[] = $row;
        }
        ob_clean();
        echo json_encode($fornecedores);
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) $data = $_POST;

        if (!isset($data['cnpj']) || !isset($data['razao_social'])) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "CNPJ e Razão Social são obrigatórios."]);
            exit;
        }

        $cnpj = $conn->real_escape_string($data['cnpj']);
        $checkSql = "SELECT id FROM fornecedores WHERE cnpj = '$cnpj' AND id_empresa = $idEmpresa";
        $checkResult = $conn->query($checkSql);
        
        if ($checkResult->num_rows > 0) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "Já existe um fornecedor com este CNPJ."]);
            exit;
        }

        $razaoSocial = $conn->real_escape_string($data['razao_social']);
        $nomeFantasia = $conn->real_escape_string($data['nome_fantasia'] ?? '');
        $inscricaoEstadual = $conn->real_escape_string($data['inscricao_estadual'] ?? '');
        $telefone = $conn->real_escape_string($data['telefone'] ?? '');
        $email = $conn->real_escape_string($data['email'] ?? '');
        
        $endereco = [
            'cep' => $data['cep'] ?? '', 'logradouro' => $data['logradouro'] ?? '',
            'numero' => $data['numero'] ?? '', 'bairro' => $data['bairro'] ?? '',
            'cidade' => $data['cidade'] ?? '', 'uf' => $data['uf'] ?? ''
        ];
        $enderecoJson = $conn->real_escape_string(json_encode($endereco));

        $sql = "INSERT INTO fornecedores (id_empresa, cnpj, razao_social, nome_fantasia, inscricao_estadual, telefone, email, endereco)
                VALUES ('$idEmpresa', '$cnpj', '$razaoSocial', '$nomeFantasia', '$inscricaoEstadual', '$telefone', '$email', '$enderecoJson')";

        ob_clean();
        echo json_encode([
            "success" => $conn->query($sql),
            "message" => $conn->insert_id ? "Fornecedor cadastrado com sucesso!" : "Erro ao cadastrar fornecedor: " . $conn->error
        ]);
        break;

    case 'PUT':
        parse_str($_SERVER['QUERY_STRING'], $params);
        $id = intval($params['id'] ?? 0);
        
        if ($id === 0) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "ID do fornecedor não especificado."]);
            exit;
        }

        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) parse_str(file_get_contents("php://input"), $data);

        $cnpj = $conn->real_escape_string($data['cnpj']);
        $razaoSocial = $conn->real_escape_string($data['razao_social']);
        $nomeFantasia = $conn->real_escape_string($data['nome_fantasia'] ?? '');
        $inscricaoEstadual = $conn->real_escape_string($data['inscricao_estadual'] ?? '');
        $telefone = $conn->real_escape_string($data['telefone'] ?? '');
        $email = $conn->real_escape_string($data['email'] ?? '');
        
        $endereco = [
            'cep' => $data['cep'] ?? '', 'logradouro' => $data['logradouro'] ?? '',
            'numero' => $data['numero'] ?? '', 'bairro' => $data['bairro'] ?? '',
            'cidade' => $data['cidade'] ?? '', 'uf' => $data['uf'] ?? ''
        ];
        $enderecoJson = $conn->real_escape_string(json_encode($endereco));

        $checkSql = "SELECT id FROM fornecedores WHERE cnpj = '$cnpj' AND id_empresa = $idEmpresa AND id != $id";
        $checkResult = $conn->query($checkSql);
        
        if ($checkResult->num_rows > 0) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "Já existe outro fornecedor com este CNPJ."]);
            exit;
        }

        $sql = "UPDATE fornecedores SET
                    cnpj = '$cnpj', razao_social = '$razaoSocial', nome_fantasia = '$nomeFantasia',
                    inscricao_estadual = '$inscricaoEstadual', telefone = '$telefone', email = '$email', endereco = '$enderecoJson'
                WHERE id = $id AND id_empresa = $idEmpresa";

        ob_clean();
        echo json_encode([
            "success" => $conn->query($sql),
            "message" => $conn->affected_rows >= 0 ? "Fornecedor atualizado com sucesso!" : "Erro ao atualizar: " . $conn->error
        ]);
        break;

    case 'DELETE':
        parse_str($_SERVER['QUERY_STRING'], $params);
        $id = intval($params['id'] ?? 0);
        
        if ($id === 0) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "ID do fornecedor não especificado."]);
            exit;
        }

        $sql = "DELETE FROM fornecedores WHERE id = $id AND id_empresa = $idEmpresa";

        ob_clean();
        echo json_encode([
            "success" => $conn->query($sql),
            "message" => $conn->affected_rows > 0 ? "Fornecedor excluído com sucesso!" : "Erro ao excluir fornecedor: " . $conn->error
        ]);
        break;

    default:
        ob_clean();
        echo json_encode(["success" => false, "message" => "Método não permitido."]);
        break;
}
?>