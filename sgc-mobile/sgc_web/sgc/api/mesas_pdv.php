<?php
// api/mesas_pdv.php — PDV de Restaurante: abrir mesa, lançar itens, fechar conta
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require 'conexao.php';
require 'sessao.php';

if (!isset($_SESSION['empresa_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Não autorizado']);
    exit;
}

$id_empresa = (int)$_SESSION['empresa_id'];
$id_usuario = (int)($_SESSION['usuario_id'] ?? 0);

// ── GET: retorna a venda em aberto de uma mesa com seus itens ──
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id_mesa = (int)($_GET['id_mesa'] ?? 0);
    if (!$id_mesa) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id_mesa necessário.']);
        exit;
    }

    try {
        // Busca a venda em aberto
        $stmt = $conn->prepare("
            SELECT v.id, v.data_venda, v.id_mesa, v.id_cliente,
                   v.cliente_nome_manual, v.cliente_cpf_manual,
                   m.numero AS mesa_numero, m.nome AS mesa_nome,
                   cl.nome AS cliente_nome
            FROM vendas v
            JOIN mesas m ON m.id = v.id_mesa
            LEFT JOIN clientes cl ON cl.id = v.id_cliente
            WHERE v.id_mesa    = ?
              AND v.id_empresa = ?
              AND v.status     = 'Em Aberto'
            LIMIT 1
        ");
        $stmt->bind_param("ii", $id_mesa, $id_empresa);
        $stmt->execute();
        $venda = $stmt->get_result()->fetch_assoc();

        if (!$venda) {
            echo json_encode(['success' => true, 'venda' => null]);
            exit;
        }

        // Busca os itens da venda
        $stmt2 = $conn->prepare("
            SELECT iv.id, iv.id_produto, iv.quantidade,
                   iv.preco_unitario, iv.subtotal,
                   p.nome AS produto_nome, p.unidade_venda
            FROM itens_venda iv
            JOIN produtos p ON p.id = iv.id_produto
            WHERE iv.id_venda = ?
            ORDER BY iv.id ASC
        ");
        $stmt2->bind_param("i", $venda['id']);
        $stmt2->execute();
        $venda['itens'] = $stmt2->get_result()->fetch_all(MYSQLI_ASSOC);
        $venda['total'] = array_sum(array_column($venda['itens'], 'subtotal'));

        echo json_encode(['success' => true, 'venda' => $venda]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// ── POST: ações da mesa ────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $d    = json_decode(file_get_contents('php://input'), true);
    $acao = $d['acao'] ?? '';

    try {
        switch ($acao) {

            // ── Abrir mesa ────────────────────────────────────
            case 'ABRIR':
                $id_mesa = (int)($d['id_mesa'] ?? 0);
                $id_cliente = !empty($d['id_cliente']) ? (int)$d['id_cliente'] : null;
                if (!$id_mesa) throw new Exception('id_mesa necessário.');

                // Verifica se a mesa existe e está livre
                $chkMesa = $conn->prepare("SELECT status FROM mesas WHERE id = ? AND id_empresa = ?");
                $chkMesa->bind_param("ii", $id_mesa, $id_empresa);
                $chkMesa->execute();
                $mesa = $chkMesa->get_result()->fetch_assoc();
                if (!$mesa) throw new Exception('Mesa não encontrada.');
                if ($mesa['status'] !== 'livre') throw new Exception('Esta mesa já está ocupada.');

                // Verifica se não há venda em aberto (redundância de segurança)
                $chkVenda = $conn->prepare("SELECT id FROM vendas WHERE id_mesa = ? AND status = 'Em Aberto' LIMIT 1");
                $chkVenda->bind_param("i", $id_mesa);
                $chkVenda->execute();
                if ($chkVenda->get_result()->num_rows > 0) throw new Exception('Já existe uma conta aberta para esta mesa.');

                $conn->begin_transaction();

                // Cria a venda em aberto
                $nome_man = !empty($d['cliente_nome_manual']) ? $conn->real_escape_string($d['cliente_nome_manual']) : null;
                $cpf_man  = !empty($d['cliente_cpf_manual']) ? $conn->real_escape_string($d['cliente_cpf_manual']) : null;

                $stmt = $conn->prepare("
                    INSERT INTO vendas (id_empresa, id_usuario, id_mesa, id_cliente, cliente_nome_manual, cliente_cpf_manual, total, forma_pagamento, status)
                    VALUES (?, ?, ?, ?, ?, ?, 0, 'PENDENTE', 'Em Aberto')
                ");
                $stmt->bind_param("iiiiss", $id_empresa, $id_usuario, $id_mesa, $id_cliente, $nome_man, $cpf_man);
                
                $stmt->execute();
                $id_venda = $stmt->insert_id;

                // Marca a mesa como ocupada
                $upd = $conn->prepare("UPDATE mesas SET status = 'ocupada' WHERE id = ?");
                $upd->bind_param("i", $id_mesa);
                $upd->execute();

                $conn->commit();
                echo json_encode(['success' => true, 'id_venda' => $id_venda, 'message' => 'Mesa aberta!']);
                break;

            // ── Vincular Cliente ──────────────────────────────
            case 'SET_CLIENTE':
                $id_venda   = (int)($d['id_venda'] ?? 0);
                $id_cliente = !empty($d['id_cliente']) ? (int)$d['id_cliente'] : null;
                $nome_man   = !empty($d['cliente_nome_manual']) ? $conn->real_escape_string($d['cliente_nome_manual']) : null;
                $cpf_man    = !empty($d['cliente_cpf_manual']) ? $conn->real_escape_string($d['cliente_cpf_manual']) : null;
                
                if (!$id_venda) throw new Exception('id_venda necessário.');
                
                $stmt = $conn->prepare("UPDATE vendas SET id_cliente = ?, cliente_nome_manual = ?, cliente_cpf_manual = ? WHERE id = ? AND id_empresa = ?");
                $stmt->bind_param("issii", $id_cliente, $nome_man, $cpf_man, $id_venda, $id_empresa);
                $stmt->execute();
                
                echo json_encode(['success' => true, 'message' => 'Cliente vinculado!']);
                break;

            // ── Adicionar item ────────────────────────────────
            case 'ADD_ITEM':
                $id_venda   = (int)($d['id_venda']   ?? 0);
                $id_produto = (int)($d['id_produto']  ?? 0);
                $quantidade = (float)($d['quantidade'] ?? 1);

                if (!$id_venda || !$id_produto || $quantidade <= 0) {
                    throw new Exception('id_venda, id_produto e quantidade são obrigatórios.');
                }

                // Valida que a venda pertence a esta empresa e está em aberto
                $chk = $conn->prepare("SELECT id FROM vendas WHERE id = ? AND id_empresa = ? AND status = 'Em Aberto'");
                $chk->bind_param("ii", $id_venda, $id_empresa);
                $chk->execute();
                if ($chk->get_result()->num_rows === 0) throw new Exception('Venda não encontrada ou já encerrada.');

                // Busca o produto
                $prod = $conn->prepare("SELECT id, nome, preco_venda, estoque FROM produtos WHERE id = ? AND id_empresa = ?");
                $prod->bind_param("ii", $id_produto, $id_empresa);
                $prod->execute();
                $produto = $prod->get_result()->fetch_assoc();
                if (!$produto) throw new Exception('Produto não encontrado.');
                if ($produto['estoque'] < $quantidade) {
                    throw new Exception("Estoque insuficiente para '{$produto['nome']}'. Disponível: {$produto['estoque']}.");
                }

                $preco    = (float)$produto['preco_venda'];
                $subtotal = $preco * $quantidade;

                // Verifica se o item já está na venda (atualiza qty)
                $existente = $conn->prepare("SELECT id, quantidade FROM itens_venda WHERE id_venda = ? AND id_produto = ?");
                $existente->bind_param("ii", $id_venda, $id_produto);
                $existente->execute();
                $item_atual = $existente->get_result()->fetch_assoc();

                $conn->begin_transaction();

                if ($item_atual) {
                    $nova_qtd      = $item_atual['quantidade'] + $quantidade;
                    $novo_subtotal = $preco * $nova_qtd;
                    $upd = $conn->prepare("UPDATE itens_venda SET quantidade = ?, subtotal = ? WHERE id = ?");
                    $upd->bind_param("ddi", $nova_qtd, $novo_subtotal, $item_atual['id']);
                    $upd->execute();
                } else {
                    $ins = $conn->prepare("INSERT INTO itens_venda (id_venda, id_produto, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?)");
                    $ins->bind_param("iiddd", $id_venda, $id_produto, $quantidade, $preco, $subtotal);
                    $ins->execute();
                }

                // Baixa estoque
                $conn->query("UPDATE produtos SET estoque = estoque - $quantidade WHERE id = $id_produto");

                // Atualiza total da venda
                $conn->query("UPDATE vendas SET total = (SELECT COALESCE(SUM(subtotal),0) FROM itens_venda WHERE id_venda = $id_venda) WHERE id = $id_venda");

                $conn->commit();
                echo json_encode(['success' => true, 'message' => 'Item adicionado!']);
                break;

            // ── Remover item ──────────────────────────────────
            case 'REMOVER_ITEM':
                $id_item = (int)($d['id_item'] ?? 0);
                if (!$id_item) throw new Exception('id_item necessário.');

                // Busca o item para devolver ao estoque
                $item = $conn->prepare("
                    SELECT iv.id_venda, iv.id_produto, iv.quantidade, v.id_empresa
                    FROM itens_venda iv
                    JOIN vendas v ON v.id = iv.id_venda
                    WHERE iv.id = ? AND v.id_empresa = ? AND v.status = 'Em Aberto'
                ");
                $item->bind_param("ii", $id_item, $id_empresa);
                $item->execute();
                $row = $item->get_result()->fetch_assoc();
                if (!$row) throw new Exception('Item não encontrado ou venda já encerrada.');

                $conn->begin_transaction();

                // Devolve ao estoque
                $conn->query("UPDATE produtos SET estoque = estoque + {$row['quantidade']} WHERE id = {$row['id_produto']}");

                // Remove o item
                $conn->query("DELETE FROM itens_venda WHERE id = $id_item");

                // Recalcula total
                $conn->query("UPDATE vendas SET total = (SELECT COALESCE(SUM(subtotal),0) FROM itens_venda WHERE id_venda = {$row['id_venda']}) WHERE id = {$row['id_venda']}");

                $conn->commit();
                echo json_encode(['success' => true, 'message' => 'Item removido!']);
                break;

            // ── Solicitar conta (status visual) ──────────────
            case 'PEDIR_CONTA':
                $id_mesa = (int)($d['id_mesa'] ?? 0);
                if (!$id_mesa) throw new Exception('id_mesa necessário.');
                $stmt = $conn->prepare("UPDATE mesas SET status = 'conta' WHERE id = ? AND id_empresa = ?");
                $stmt->bind_param("ii", $id_mesa, $id_empresa);
                $stmt->execute();
                echo json_encode(['success' => true, 'message' => 'Conta solicitada!']);
                break;

            // ── Fechar conta / finalizar venda ────────────────
            case 'FECHAR':
                $id_venda       = (int)($d['id_venda']        ?? 0);
                $id_mesa        = (int)($d['id_mesa']          ?? 0);
                $forma_pagamento = strtoupper(trim($d['forma_pagamento'] ?? 'DINHEIRO'));
                $desconto       = (float)($d['desconto']       ?? 0);

                if (!$id_venda || !$id_mesa) throw new Exception('id_venda e id_mesa são obrigatórios.');

                // Valida e calcula total final
                $chk = $conn->prepare("SELECT id, total FROM vendas WHERE id = ? AND id_empresa = ? AND status = 'Em Aberto'");
                $chk->bind_param("ii", $id_venda, $id_empresa);
                $chk->execute();
                $venda = $chk->get_result()->fetch_assoc();
                if (!$venda) throw new Exception('Venda não encontrada ou já encerrada.');

                $total_final = max(0, (float)$venda['total'] - $desconto);

                $conn->begin_transaction();

                // Finaliza a venda
                $stmt = $conn->prepare("
                    UPDATE vendas SET
                        status           = 'Finalizada',
                        forma_pagamento  = ?,
                        total            = ?,
                        data_venda       = NOW()
                    WHERE id = ?
                ");
                $stmt->bind_param("sdi", $forma_pagamento, $total_final, $id_venda);
                $stmt->execute();

                // Libera a mesa
                $upd = $conn->prepare("UPDATE mesas SET status = 'livre' WHERE id = ? AND id_empresa = ?");
                $upd->bind_param("ii", $id_mesa, $id_empresa);
                $upd->execute();

                $conn->commit();
                echo json_encode([
                    'success'     => true,
                    'total_final' => $total_final,
                    'message'     => 'Conta fechada com sucesso!',
                ]);
                break;

            default:
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => "Ação '$acao' inválida."]);
        }
    } catch (Exception $e) {
        if ($conn->in_transaction ?? false) $conn->rollback();
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Método não suportado.']);
