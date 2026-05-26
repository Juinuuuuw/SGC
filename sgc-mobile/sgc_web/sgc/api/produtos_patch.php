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
        // Busca por código de barras ou referência (Mobile / Câmera)
        if (isset($_GET['barcode'])) {
            $barcode = $conn->real_escape_string($_GET['barcode']);
            $sql = "SELECT * FROM produtos
                    WHERE id_empresa = $idEmpresa
                    AND (referencia = '$barcode' OR id = '$barcode')
                    LIMIT 1";
            $res = $conn->query($sql);
            ob_clean();
            echo json_encode($res && $res->num_rows > 0 ? $res->fetch_assoc() : null);
            exit;
        }

        // Busca por nome ou referência (Autocomplete no PDV)
        if (isset($_GET['search'])) {
            $search = $conn->real_escape_string($_GET['search']);
            $sql = "SELECT id, referencia, nome, unidade_venda, preco_venda, estoque
                    FROM produtos
                    WHERE id_empresa = $idEmpresa
                    AND (nome LIKE '%$search%' OR referencia LIKE '%$search%')
                    ORDER BY nome ASC
                    LIMIT 20";
            $res = $conn->query($sql);
            $prods = [];
            while ($row = $res->fetch_assoc()) { $prods[] = $row; }
            ob_clean();
            echo json_encode($prods);
            exit;
        }

        // Listagem normal de todos os produtos
        $sql = "SELECT * FROM produtos WHERE id_empresa = $idEmpresa ORDER BY nome ASC";
        $resultado = $conn->query($sql);
        $produtos = [];
        while ($row = $resultado->fetch_assoc()) {
            $produtos[] = $row;
        }
        ob_clean();
        echo json_encode($produtos);
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) $data = $_POST;

        if (!isset($data['nome']) || !isset($data['preco_custo'])) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "Campos obrigatórios ausentes."]);
            exit;
        }

        $referencia = $conn->real_escape_string($data['referencia'] ?? '');
        $nome = $conn->real_escape_string($data['nome']);
        $unidade_venda = $conn->real_escape_string($data['unidade_venda'] ?? 'UN');
        $descricao = $conn->real_escape_string($data['descricao'] ?? '');
        $preco_custo = floatval($data['preco_custo']);
        $margem = floatval($data['margem'] ?? 0);
        $preco_venda = floatval($data['preco_venda'] ?? 0);
        $estoque = 0;

        $sql = "INSERT INTO produtos (id_empresa, referencia, nome, unidade_venda, descricao, preco_custo, margem, preco_venda, estoque)
                VALUES ('$idEmpresa', '$referencia', '$nome', '$unidade_venda', '$descricao', '$preco_custo', '$margem', '$preco_venda', '$estoque')";

        ob_clean();
        echo json_encode([
            "success" => $conn->query($sql),
            "message" => $conn->insert_id ? "Produto cadastrado com sucesso!" : "Erro: " . $conn->error
        ]);
        break;

    case 'PUT':
        parse_str($_SERVER['QUERY_STRING'], $params);
        $id = intval($params['id'] ?? 0);
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) parse_str(file_get_contents("php://input"), $data);

        $referencia = $conn->real_escape_string($data['referencia'] ?? '');
        $nome = $conn->real_escape_string($data['nome']);
        $unidade_venda = $conn->real_escape_string($data['unidade_venda'] ?? 'UN');
        $descricao = $conn->real_escape_string($data['descricao'] ?? '');
        $preco_custo = floatval($data['preco_custo']);
        $margem = floatval($data['margem'] ?? 0);
        $preco_venda = floatval($data['preco_venda'] ?? 0);

        $sql = "UPDATE produtos SET
                    referencia='$referencia', nome='$nome', unidade_venda='$unidade_venda',
                    descricao='$descricao', preco_custo='$preco_custo', margem='$margem', preco_venda='$preco_venda'
                WHERE id=$id AND id_empresa=$idEmpresa";

        ob_clean();
        echo json_encode([
            "success" => $conn->query($sql),
            "message" => $conn->affected_rows >= 0 ? "Produto atualizado com sucesso!" : "Erro: " . $conn->error
        ]);
        break;

    case 'DELETE':
        parse_str($_SERVER['QUERY_STRING'], $params);
        $id = intval($params['id'] ?? 0);

        $sql = "DELETE FROM produtos WHERE id=$id AND id_empresa=$idEmpresa";

        ob_clean();
        echo json_encode([
            "success" => $conn->query($sql),
            "message" => $conn->affected_rows > 0 ? "Produto excluído com sucesso!" : "Erro: " . $conn->error
        ]);
        break;

    default:
        ob_clean();
        echo json_encode(["success" => false, "message" => "Método não permitido."]);
        break;
}
?>