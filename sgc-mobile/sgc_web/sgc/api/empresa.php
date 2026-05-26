<?php
// api/empresa.php — Dados completos da Empresa (GET e PUT)
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require 'conexao.php';
require 'sessao.php';

if (!isset($_SESSION['empresa_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Não autorizado']);
    exit;
}

$id_empresa = (int)$_SESSION['empresa_id'];
$method     = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $stmt = $conn->prepare("
            SELECT id, razao_social, nome_fantasia, cnpj_cpf,
                   email, telefone, cep, logradouro, numero,
                   bairro, cidade, uf, segmento
            FROM empresas WHERE id = ?
        ");
        $stmt->bind_param("i", $id_empresa);
        $stmt->execute();
        $empresa = $stmt->get_result()->fetch_assoc();

        if (!$empresa) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Empresa não encontrada.']);
            exit;
        }

        echo json_encode(['success' => true, 'empresa' => $empresa]);
        exit;
    }

    if ($method === 'PUT') {
        $d = json_decode(file_get_contents('php://input'), true);

        // Validações básicas
        $razao_social = trim($d['razao_social'] ?? '');
        if (!$razao_social) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Razão Social é obrigatória.']);
            exit;
        }

        $segmento = in_array($d['segmento'] ?? '', ['varejista', 'restaurante'])
                    ? $d['segmento']
                    : 'varejista';

        $stmt = $conn->prepare("
            UPDATE empresas SET
                razao_social  = ?,
                nome_fantasia = ?,
                cnpj_cpf      = ?,
                email         = ?,
                telefone      = ?,
                cep           = ?,
                logradouro    = ?,
                numero        = ?,
                bairro        = ?,
                cidade        = ?,
                uf            = ?,
                segmento      = ?
            WHERE id = ?
        ");
        $stmt->bind_param(
            "ssssssssssssi",
            $razao_social,
            $d['nome_fantasia'],
            $d['cnpj_cpf'],
            $d['email'],
            $d['telefone'],
            $d['cep'],
            $d['logradouro'],
            $d['numero'],
            $d['bairro'],
            $d['cidade'],
            $d['uf'],
            $segmento,
            $id_empresa
        );
        $stmt->execute();

        echo json_encode([
            'success'  => true,
            'message'  => 'Dados da empresa atualizados com sucesso!',
            'segmento' => $segmento,
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método não permitido.']);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
