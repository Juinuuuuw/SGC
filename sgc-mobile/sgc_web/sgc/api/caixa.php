<?php
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
$idUsuario = $_SESSION['usuario_id'] ?? null;

if (!$idEmpresa) {
    if (ob_get_length()) ob_clean();
    echo json_encode(["success" => false, "message" => "Sua sessão expirou. Faça login novamente."]);
    exit;
}

if ($method === 'GET') {
    try {
        // Disfarçamos as colunas do SQL para o App React Native não precisar de ser alterado
        $sql = "SELECT c.id, c.id_empresa, c.id_usuario_abertura as id_usuario, c.abertura as data_abertura, 
                       c.saldo_inicial, c.saldo_final as saldo_fechamento, 
                       c.sangria, c.valor_restante, c.observacoes,
                       IF(c.aberto=1, 'ABERTO', 'FECHADO') as status, u.nome as nome_usuario
                FROM caixas c
                LEFT JOIN usuarios u ON c.id_usuario_abertura = u.id
                WHERE c.id_usuario_abertura = $idUsuario AND c.aberto = 1
                ORDER BY c.abertura DESC LIMIT 1";

        $res = $conn->query($sql);
        $caixa = $res && $res->num_rows > 0 ? $res->fetch_assoc() : null;
        
        if ($caixa) {
            // Garante que saldo_atual seja calculado ou retornado para o app
            $caixa['saldo_atual'] = $caixa['saldo_inicial']; // Idealmente seria a soma das vendas, mas mantemos compatibilidade
        }
        
        if (ob_get_length()) ob_clean();
        echo json_encode($caixa);
    } catch (Exception $e) {
        if (ob_get_length()) ob_clean();
        echo json_encode(["success" => false, "message" => "Erro BD: " . $e->getMessage()]);
    }
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data) $data = $_POST;

    $acao = $data['acao'] ?? '';

    if ($acao === 'ABRIR') {
        $saldoInicial = floatval(str_replace(',', '.', $data['saldo_inicial'] ?? 0));
        $saldo_sql = number_format($saldoInicial, 2, '.', '');

        try {
            $check = $conn->query("SELECT id FROM caixas WHERE id_usuario_abertura = $idUsuario AND aberto = 1 LIMIT 1");
            if ($check && $check->num_rows > 0) {
                $caixa = $check->fetch_assoc();
                if (ob_get_length()) ob_clean();
                echo json_encode(["success" => true, "caixa" => $caixa, "message" => "Caixa já estava aberto."]);
                exit;
            }

            $sql = "INSERT INTO caixas (id_empresa, id_usuario_abertura, abertura, saldo_inicial, aberto)
                    VALUES ($idEmpresa, $idUsuario, NOW(), $saldo_sql, 1)";
            $conn->query($sql);
            $id = $conn->insert_id;
            
            if (ob_get_length()) ob_clean();
            echo json_encode(["success" => true, "id" => $id, "caixa" => ["id" => $id]]);

        } catch (Exception $e) {
            if (ob_get_length()) ob_clean();
            echo json_encode(["success" => false, "message" => "Erro BD (Abrir): " . $e->getMessage()]);
        }
        exit;
    }

    if ($acao === 'FECHAR') {
        $idCaixa = intval($data['id_caixa'] ?? 0);
        $saldoFechamento = floatval(str_replace(',', '.', $data['saldo_fechamento'] ?? 0));
        $sangria = floatval(str_replace(',', '.', $data['sangria'] ?? 0));
        $valorRestante = floatval(str_replace(',', '.', $data['valor_restante'] ?? 0));
        $obs = $conn->real_escape_string($data['observacoes'] ?? '');

        $saldo_sql = number_format($saldoFechamento, 2, '.', '');
        $sangria_sql = number_format($sangria, 2, '.', '');
        $restante_sql = number_format($valorRestante, 2, '.', '');

        try {
            $sql = "UPDATE caixas SET
                        aberto = 0,
                        fechamento = NOW(),
                        saldo_final = $saldo_sql,
                        sangria = $sangria_sql,
                        valor_restante = $restante_sql,
                        observacoes = '$obs',
                        id_usuario_fechamento = $idUsuario
                    WHERE id = $idCaixa AND id_usuario_abertura = $idUsuario";
            $conn->query($sql);
            
            if (ob_get_length()) ob_clean();
            echo json_encode(["success" => true, "message" => "Caixa fechado com sucesso."]);
        } catch (Exception $e) {
            if (ob_get_length()) ob_clean();
            echo json_encode(["success" => false, "message" => "Erro BD (Fechar): " . $e->getMessage()]);
        }
        exit;
    }
    
    if (ob_get_length()) ob_clean();
    echo json_encode(["success" => false, "message" => "Ação inválida."]);
}
?>