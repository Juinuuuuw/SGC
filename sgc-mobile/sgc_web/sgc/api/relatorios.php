<?php
// api/relatorios.php — Gerador de dados para Relatórios Profissionais
require 'conexao.php';
require 'sessao.php';

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");

$idEmpresa = $_SESSION['empresa_id'] ?? null;
if (!$idEmpresa) { echo json_encode(["success" => false, "message" => "Não autenticado"]); exit; }

$tipo = $_GET['tipo'] ?? '';
$de   = $_GET['de'] ?? date('Y-m-01');
$ate  = $_GET['ate'] ?? date('Y-m-d');

try {
    switch ($tipo) {
        case 'estoque':
            // Posição Geral de Estoque
            $sql = "SELECT id, nome, referencia, unidade_venda, estoque, preco_custo, preco_venda,
                           (estoque * preco_custo) as valor_custo,
                           (estoque * preco_venda) as valor_venda
                    FROM produtos 
                    WHERE id_empresa = $idEmpresa 
                    ORDER BY nome ASC";
            $res = $conn->query($sql);
            $posicao = $res->fetch_all(MYSQLI_ASSOC);
            echo json_encode(["success" => true, "posicao" => $posicao]);
            break;

        case 'vendas':
            // Vendas por Período
            $sql = "SELECT v.id, v.data_venda, v.total, v.forma_pagamento, 
                           cl.nome as cliente_nome, v.cliente_nome_manual
                    FROM vendas v 
                    LEFT JOIN clientes cl ON v.id_cliente = cl.id
                    WHERE v.id_empresa = $idEmpresa 
                      AND v.data_venda BETWEEN '$de 00:00:00' AND '$ate 23:59:59'
                    ORDER BY v.data_venda DESC";
            $res = $conn->query($sql);
            $vendas = $res->fetch_all(MYSQLI_ASSOC);

            // Resumo
            $totalFaturado = array_sum(array_column($vendas, 'total'));
            $qtdVendas = count($vendas);

            // Top Produtos
            $sqlTop = "SELECT p.nome, SUM(iv.quantidade) as qtd_total, SUM(iv.subtotal) as receita_total
                       FROM itens_venda iv
                       JOIN produtos p ON iv.id_produto = p.id
                       JOIN vendas v ON iv.id_venda = v.id
                       WHERE v.id_empresa = $idEmpresa AND v.status = 'Finalizada'
                         AND v.data_venda BETWEEN '$de 00:00:00' AND '$ate 23:59:59'
                       GROUP BY p.id ORDER BY qtd_total DESC LIMIT 15";
            $resTop = $conn->query($sqlTop);
            $top = $resTop->fetch_all(MYSQLI_ASSOC);

            echo json_encode([
                "success" => true, 
                "lista" => $vendas,
                "top_produtos" => $top,
                "resumo" => [
                    "total_vendas" => $qtdVendas,
                    "faturamento" => $totalFaturado,
                    "ticket_medio" => $qtdVendas > 0 ? $totalFaturado / $qtdVendas : 0
                ]
            ]);
            break;

        case 'financeiro':
            // Simulação de fluxo baseada nas vendas (pode ser expandido com a tabela de lancamentos)
            $sql = "SELECT SUM(total) as faturamento FROM vendas WHERE id_empresa = $idEmpresa AND data_venda BETWEEN '$de 00:00:00' AND '$ate 23:59:59'";
            $fat = $conn->query($sql)->fetch_assoc()['faturamento'] ?? 0;
            echo json_encode(["success" => true, "resumo" => ["faturamento" => (float)$fat]]);
            break;

        default:
            echo json_encode(["success" => false, "message" => "Tipo de relatório inválido"]);
    }
} catch (Exception $e) {
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
?>