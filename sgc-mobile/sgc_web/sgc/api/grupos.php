<?php
// api/grupos.php — CRUD de Grupos e Subgrupos de Produtos
// GET           → lista árvore completa de grupos da empresa
// GET?seed=1    → cria grupos padrão baseado no segmento (só se ainda não houver grupos)
// POST          → cria grupo ou subgrupo
// PUT?id=X      → atualiza nome/ícone/ordem
// DELETE?id=X   → exclui grupo não-padrão (move filhos para o pai)

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
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
$id         = isset($_GET['id']) ? (int)$_GET['id'] : null;

// ════════════════════════════════════════════════════════════
//  GRUPOS PADRÃO POR SEGMENTO
// ════════════════════════════════════════════════════════════
function seedGruposPadrao($conn, $id_empresa, $segmento) {
    // Definição da árvore padrão por segmento
    $arvores = [
        'restaurante' => [
            [
                'nome' => 'Cardápio', 'icone' => '🍽️', 'ordem' => 1,
                'filhos' => [
                    ['nome' => 'Entradas',           'icone' => '🥗', 'ordem' => 1],
                    ['nome' => 'Pratos Principais',  'icone' => '🍖', 'ordem' => 2],
                    ['nome' => 'Sobremesas',          'icone' => '🍰', 'ordem' => 3],
                    ['nome' => 'Bebidas',             'icone' => '🥤', 'ordem' => 4],
                    ['nome' => 'Porções e Petiscos',  'icone' => '🍕', 'ordem' => 5],
                ],
            ],
            [
                'nome' => 'Insumos', 'icone' => '📦', 'ordem' => 2,
                'filhos' => [
                    ['nome' => 'Carnes e Proteínas',       'icone' => '🥩', 'ordem' => 1],
                    ['nome' => 'Hortifruti',               'icone' => '🥦', 'ordem' => 2],
                    ['nome' => 'Laticínios',               'icone' => '🥛', 'ordem' => 3],
                    ['nome' => 'Grãos e Cereais',          'icone' => '🌾', 'ordem' => 4],
                    ['nome' => 'Temperos e Condimentos',   'icone' => '🧂', 'ordem' => 5],
                    ['nome' => 'Embalagens e Descartáveis','icone' => '🫙', 'ordem' => 6],
                ],
            ],
            [
                'nome' => 'Outros', 'icone' => '📋', 'ordem' => 3,
                'filhos' => [],
            ],
        ],
        'varejista' => [
            // Varejista começa com slate limpo + apenas "Sem Categoria" virtual (NULL)
            // O usuário cria seus próprios grupos
            // Mas inserimos um "Geral" como ponto de partida
            ['nome' => 'Geral',    'icone' => '📋', 'ordem' => 1, 'filhos' => []],
        ],
    ];

    $grupos = $arvores[$segmento] ?? $arvores['varejista'];

    $stmtPai = $conn->prepare(
        "INSERT INTO grupos_produtos (id_empresa, id_pai, nome, icone, ordem, padrao) VALUES (?, NULL, ?, ?, ?, 1)"
    );
    $stmtFilho = $conn->prepare(
        "INSERT INTO grupos_produtos (id_empresa, id_pai, nome, icone, ordem, padrao) VALUES (?, ?, ?, ?, ?, 1)"
    );

    foreach ($grupos as $g) {
        $stmtPai->bind_param("issi", $id_empresa, $g['nome'], $g['icone'], $g['ordem']);
        $stmtPai->execute();
        $id_pai = $stmtPai->insert_id;

        foreach (($g['filhos'] ?? []) as $f) {
            $stmtFilho->bind_param("iissi", $id_empresa, $id_pai, $f['nome'], $f['icone'], $f['ordem']);
            $stmtFilho->execute();
        }
    }
}

// ── Helper: monta árvore a partir de lista plana ─────────────
function montarArvore($lista) {
    $mapa   = [];
    $raizes = [];

    foreach ($lista as $g) {
        $mapa[$g['id']] = array_merge($g, ['subgrupos' => []]);
    }
    foreach ($mapa as $id => &$g) {
        if ($g['id_pai']) {
            if (isset($mapa[$g['id_pai']])) {
                $mapa[$g['id_pai']]['subgrupos'][] = &$g;
            }
        } else {
            $raizes[] = &$g;
        }
    }
    return $raizes;
}

try {
    switch ($method) {

        // ── GET ───────────────────────────────────────────────
        case 'GET':
            // Seed automático se solicitado ou se empresa ainda não tem grupos
            $seed = isset($_GET['seed']) || isset($_GET['auto_seed']);

            if ($seed) {
                $stmt = $conn->prepare("SELECT COUNT(*) FROM grupos_produtos WHERE id_empresa = ?");
                $stmt->bind_param("i", $id_empresa); $stmt->execute();
                $total = $stmt->get_result()->fetch_row()[0];

                if ($total == 0) {
                    // Descobre o segmento da empresa
                    $stmt2 = $conn->prepare("SELECT segmento FROM empresas WHERE id = ?");
                    $stmt2->bind_param("i", $id_empresa); $stmt2->execute();
                    $row = $stmt2->get_result()->fetch_assoc();
                    seedGruposPadrao($conn, $id_empresa, $row['segmento'] ?? 'varejista');
                }
            }

            $stmt = $conn->prepare("
                SELECT id, id_pai, nome, icone, ordem, padrao, ativo,
                       (SELECT COUNT(*) FROM grupos_produtos sub
                        WHERE sub.id_pai = g.id) AS qtd_subgrupos,
                       (SELECT COUNT(*) FROM produtos p
                        WHERE p.id_grupo = g.id) AS qtd_produtos
                FROM grupos_produtos g
                WHERE id_empresa = ? AND ativo = 1
                ORDER BY id_pai IS NOT NULL, id_pai, ordem, nome
            ");
            $stmt->bind_param("i", $id_empresa);
            $stmt->execute();
            $lista  = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $arvore = montarArvore($lista);
            echo json_encode(['success' => true, 'grupos' => $arvore, 'lista' => $lista]);
            break;

        // ── POST (criar) ──────────────────────────────────────
        case 'POST':
            $d    = json_decode(file_get_contents('php://input'), true);
            $nome = trim($d['nome'] ?? '');
            if (!$nome) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Nome é obrigatório.']);
                exit;
            }

            $id_pai = !empty($d['id_pai']) ? (int)$d['id_pai'] : null;
            $icone  = trim($d['icone']  ?? '') ?: null;
            $ordem  = (int)($d['ordem'] ?? 0);

            // Valida que o pai pertence à mesma empresa e é raiz (apenas 2 níveis)
            if ($id_pai) {
                $chk = $conn->prepare("SELECT id, id_pai FROM grupos_produtos WHERE id = ? AND id_empresa = ?");
                $chk->bind_param("ii", $id_pai, $id_empresa); $chk->execute();
                $pai = $chk->get_result()->fetch_assoc();
                if (!$pai) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Grupo pai não encontrado.']); exit; }
                if ($pai['id_pai']) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'Não é possível criar subgrupos de subgrupos (máximo 2 níveis).']); exit; }
            }

            $stmt = $conn->prepare("INSERT INTO grupos_produtos (id_empresa, id_pai, nome, icone, ordem, padrao) VALUES (?, ?, ?, ?, ?, 0)");
            $stmt->bind_param("iissi", $id_empresa, $id_pai, $nome, $icone, $ordem);
            $stmt->execute();
            echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'message' => 'Grupo criado com sucesso!']);
            break;

        // ── PUT (atualizar) ───────────────────────────────────
        case 'PUT':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }
            $d    = json_decode(file_get_contents('php://input'), true);
            $nome = trim($d['nome'] ?? '');
            if (!$nome) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'Nome é obrigatório.']); exit; }

            $icone = trim($d['icone'] ?? '') ?: null;
            $ordem = (int)($d['ordem'] ?? 0);

            $stmt = $conn->prepare("UPDATE grupos_produtos SET nome = ?, icone = ?, ordem = ? WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ssiii", $nome, $icone, $ordem, $id, $id_empresa);
            $stmt->execute();
            echo json_encode(['success' => true, 'message' => 'Grupo atualizado!']);
            break;

        // ── DELETE ────────────────────────────────────────────
        case 'DELETE':
            if (!$id) { http_response_code(400); echo json_encode(['success' => false, 'message' => 'ID necessário.']); exit; }

            // Verifica se é padrão do sistema
            $chk = $conn->prepare("SELECT padrao, id_pai FROM grupos_produtos WHERE id = ? AND id_empresa = ?");
            $chk->bind_param("ii", $id, $id_empresa); $chk->execute();
            $g = $chk->get_result()->fetch_assoc();

            if (!$g) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Grupo não encontrado.']); exit; }
            if ($g['padrao']) { http_response_code(403); echo json_encode(['success' => false, 'message' => 'Grupos padrão do sistema não podem ser excluídos. Você pode renomeá-los.']); exit; }

            $conn->begin_transaction();
            // Move subgrupos para o pai (ou para raiz)
            $conn->prepare("UPDATE grupos_produtos SET id_pai = ? WHERE id_pai = ? AND id_empresa = ?")
                 ->bind_param("iii", $g['id_pai'], $id, $id_empresa);
            // Desvincula produtos
            $conn->prepare("UPDATE produtos SET id_grupo = NULL WHERE id_grupo = ? AND id_empresa = ?")
                 ->bind_param("ii", $id, $id_empresa);
            // Soft-delete
            $stmt = $conn->prepare("UPDATE grupos_produtos SET ativo = 0 WHERE id = ? AND id_empresa = ?");
            $stmt->bind_param("ii", $id, $id_empresa); $stmt->execute();
            $conn->commit();
            echo json_encode(['success' => true, 'message' => 'Grupo excluído! Produtos desvinculados.']);
            break;
    }
} catch (Exception $e) {
    if (isset($conn) && $conn->in_transaction) $conn->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
