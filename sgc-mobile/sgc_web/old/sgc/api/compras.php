<?php
// api/compras.php
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
    // ════════════════════════════════════════════════════════
    //  GET — Listar compras, detalhes ou itens
    // ════════════════════════════════════════════════════════
    case 'GET':
        // Buscar itens de uma compra específica
        if (isset($_GET['compra_id']) && isset($_GET['itens'])) {
            $compraId = intval($_GET['compra_id']);
            $sql = "SELECT ic.*, p.nome as produto_nome 
                    FROM itens_compra ic 
                    LEFT JOIN produtos p ON ic.id_produto = p.id 
                    WHERE ic.id_compra = $compraId";
            $resultado = $conn->query($sql);
            $itens = [];
            while ($row = $resultado->fetch_assoc()) { $itens[] = $row; }
            ob_clean();
            echo json_encode($itens);
            exit;
        }

        // Buscar uma compra específica por ID
        if (isset($_GET['id'])) {
            $compraId = intval($_GET['id']);
            $sql = "SELECT c.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj,
                           u.nome as usuario_conferencia_nome
                    FROM compras c 
                    LEFT JOIN fornecedores f ON c.id_fornecedor = f.id 
                    LEFT JOIN usuarios u ON c.id_usuario_conferencia = u.id
                    WHERE c.id = $compraId AND c.id_empresa = $idEmpresa";
            $resultado = $conn->query($sql);
            if ($resultado->num_rows === 0) {
                ob_clean();
                echo json_encode(["success" => false, "message" => "Compra não encontrada."]);
                exit;
            }
            ob_clean();
            echo json_encode($resultado->fetch_assoc());
            exit;
        }

        // Listar todas as compras
        $sql = "SELECT c.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj,
                       u.nome as usuario_conferencia_nome
                FROM compras c 
                LEFT JOIN fornecedores f ON c.id_fornecedor = f.id 
                LEFT JOIN usuarios u ON c.id_usuario_conferencia = u.id
                WHERE c.id_empresa = $idEmpresa 
                ORDER BY c.data_emissao DESC";
        $resultado = $conn->query($sql);
        $compras = [];

        while ($row = $resultado->fetch_assoc()) {
            $countSql = "SELECT COUNT(*) as total_itens FROM itens_compra WHERE id_compra = {$row['id']}";
            $countResult = $conn->query($countSql);
            $countData = $countResult->fetch_assoc();
            $row['quantidade_itens'] = $countData['total_itens'];
            $compras[] = $row;
        }

        // DEBUG PARA O MOBILE (comentado se não quiser sujar, mas útil agora)
        // error_log("SGC DEBUG: Empresa $idEmpresa listando " . count($compras) . " compras.");

        ob_clean();
        echo json_encode($compras);
    break;

    // ════════════════════════════════════════════════════════
    //  POST — Conferência mobile OU Importação XML web
    // ════════════════════════════════════════════════════════
    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$data) $data = $_POST;
        
        // ════════════════════════════════════════════════════════
        // ROTA 1: Conferência do App Mobile (Pode ser de uma nota existente ou nova)
        // ════════════════════════════════════════════════════════
        if (isset($data['itens']) && !isset($data['xml_data'])) {
            $conn->begin_transaction();
            
            try {
                $compraId     = !empty($data['id_compra']) ? (int)$data['id_compra'] : 0;
                $itensMobile  = $data['itens'] ?? [];
                $idUsuario    = $_SESSION['usuario_id'] ?? null;
                
                if (empty($itensMobile)) {
                    throw new Exception("Nenhum item enviado na conferência.");
                }

                // Se for uma conferência de uma nota que já foi lançada (PENDENTE)
                if ($compraId > 0) {
                    foreach ($itensMobile as $item) {
                        $idItem = (int)($item['id_item'] ?? 0);
                        $qtdConf = (float)($item['quantidade_conferida'] ?? $item['quantidade'] ?? 0);
                        
                        if ($idItem > 0) {
                            $conn->query("UPDATE itens_compra SET quantidade_conferida = $qtdConf WHERE id = $idItem AND id_compra = $compraId");
                        }
                    }
                    
                    $conn->query("UPDATE compras SET status = 'CONFERIDA', id_usuario_conferencia = $idUsuario WHERE id = $compraId");
                    
                } else {
                    // Conferência avulsa (estilo antigo, mas agora cai como CONFERIDA sem atualizar estoque direto)
                    $idFornecedor = !empty($data['id_fornecedor']) ? (int)$data['id_fornecedor'] : 'NULL';
                    $numeroNota   = $conn->real_escape_string($data['numero_nota'] ?? '');
                    $valorTotal   = (float)($data['valor_total'] ?? 0);
                    
                    $sqlCompra = "INSERT INTO compras 
                        (id_empresa, id_fornecedor, numero_nota, valor_total, data_emissao, status, id_usuario_conferencia)
                        VALUES ($idEmpresa, $idFornecedor, '$numeroNota', $valorTotal, NOW(), 'CONFERIDA', $idUsuario)";
                    
                    if (!$conn->query($sqlCompra)) throw new Exception("Erro ao criar compra: " . $conn->error);
                    
                    $compraId = $conn->insert_id;
                    
                    foreach ($itensMobile as $item) {
                        $nome        = $conn->real_escape_string($item['nome'] ?? 'Produto sem nome');
                        $referencia  = $conn->real_escape_string($item['referencia'] ?? '');
                        $quantidade  = (float)($item['quantidade'] ?? 0);
                        $precoUnit   = (float)($item['preco_unitario'] ?? 0);
                        $idProduto   = !empty($item['id_produto']) ? (int)$item['id_produto'] : 'NULL';
                        $subtotal    = $quantidade * $precoUnit;

                        $sqlItem = "INSERT INTO itens_compra 
                            (id_compra, id_produto, descricao, referencia, quantidade_comercial, quantidade_conferida, valor_unitario, valor_total)
                            VALUES ($compraId, $idProduto, '$nome', '$referencia', $quantidade, $quantidade, $precoUnit, $subtotal)";
                        $conn->query($sqlItem);
                    }
                }
                
                $conn->commit();
                ob_clean();
                echo json_encode(['success' => true, 'message' => "Conferência registrada com sucesso!"]);
                exit;
                
            } catch (Exception $e) {
                $conn->rollback();
                ob_clean();
                echo json_encode(['success' => false, 'message' => 'Erro: ' . $e->getMessage()]);
                exit;
            }
        }
        
        // ════════════════════════════════════════════════════════
        // ROTA 2: Importação de XML (Web ou Mobile) - Agora entra como PENDENTE
        // ════════════════════════════════════════════════════════
        if (!isset($data['xml_data'])) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "Dados inválidos."]);
            exit;
        }

        $conn->begin_transaction();
        try {
            $xmlData = $data['xml_data'];
            $fornecedorId = cadastrarOuAtualizarFornecedor($xmlData['fornecedor'], $idEmpresa, $conn);
            $compraId = cadastrarCompra($xmlData['dados_nota'], $fornecedorId, $idEmpresa, $conn);
            $produtosProcessados = processarItensCompra($xmlData['itens'], $compraId, $idEmpresa, $conn);

            $conn->commit();
            ob_clean();
            echo json_encode(["success" => true, "message" => "Nota importada como PENDENTE.", "data" => ["compra_id" => $compraId]]);
        } catch (Exception $e) {
            $conn->rollback();
            ob_clean();
            echo json_encode(["success" => false, "message" => "Erro: " . $e->getMessage()]);
        }
        break;

    // ════════════════════════════════════════════════════════
    //  PUT — Reprocessar compra
    // ════════════════════════════════════════════════════════
    case 'PUT':
        parse_str($_SERVER['QUERY_STRING'], $params);
        $compraId = intval($params['id'] ?? 0);
        $acao     = $params['acao'] ?? '';
        
        if ($compraId === 0) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "ID da compra não especificado."]);
            exit;
        }

        $data = json_decode(file_get_contents("php://input"), true);

        // ════════════════════════════════════════════════════════
        // ROTA 1: PROCESSAR COMPRA (WEB) - Aplica estoque final
        // ════════════════════════════════════════════════════════
        if ($acao === 'PROCESSAR') {
            $conn->begin_transaction();
            try {
                $itens = $data['itens'] ?? []; // [{id_item, fator_conversao, preco_custo, margem, preco_venda}]
                
                foreach ($itens as $item) {
                    $idItem = (int)$item['id_item'];
                    $fator  = (float)($item['fator_conversao'] ?? 1);
                    $unidadeVenda = $conn->real_escape_string($item['unidade_venda'] ?? 'UN');
                    $custo  = (float)($item['preco_custo'] ?? 0);
                    $margem = (float)($item['margem'] ?? 0);
                    $venda  = (float)($item['preco_venda'] ?? 0);

                    // Busca dados do item e produto vinculado
                    $busca = $conn->query("SELECT id_produto, quantidade_comercial, quantidade_conferida FROM itens_compra WHERE id = $idItem");
                    $rowItem = $busca->fetch_assoc();
                    $idProd = $rowItem['id_produto'];
                    
                    // Se não conferiu no app, usa a quantidade comercial da nota
                    $qtdBase = ($rowItem['quantidade_conferida'] !== null) ? $rowItem['quantidade_conferida'] : $rowItem['quantidade_comercial'];
                    $qtdFinal = $qtdBase * $fator;

                    // Atualiza o item com o fator usado
                    $conn->query("UPDATE itens_compra SET fator_conversao = $fator WHERE id = $idItem");

                    // Atualiza o produto (estoque, preços e unidade)
                    if ($idProd) {
                        $conn->query("UPDATE produtos SET 
                            estoque = estoque + $qtdFinal,
                            unidade_venda = '$unidadeVenda',
                            preco_custo = $custo,
                            margem = $margem,
                            preco_venda = $venda
                            WHERE id = $idProd");
                    }
                }

                $conn->query("UPDATE compras SET status = 'PROCESSADA' WHERE id = $compraId");
                $conn->commit();
                ob_clean();
                echo json_encode(["success" => true, "message" => "Compra processada e estoque atualizado!"]);
            } catch (Exception $e) {
                $conn->rollback();
                ob_clean();
                echo json_encode(["success" => false, "message" => "Erro ao processar: " . $e->getMessage()]);
            }
            exit;
        }

        // ROTA 2: REPROCESSAR (LEGADO)
        if (!isset($data['itens_reprocessados'])) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "Dados de reprocessamento não fornecidos."]);
            exit;
        }

        $conn->begin_transaction();
        
        try {
            $compraSql = "SELECT * FROM compras WHERE id = $compraId AND id_empresa = $idEmpresa";
            $compraResult = $conn->query($compraSql);
            if ($compraResult->num_rows === 0) {
                throw new Exception("Compra não encontrada.");
            }

            $itensOriginaisSql = "SELECT * FROM itens_compra WHERE id_compra = $compraId";
            $itensOriginaisResult = $conn->query($itensOriginaisSql);
            $itensOriginais = [];
            while ($row = $itensOriginaisResult->fetch_assoc()) {
                $itensOriginais[$row['id_produto']] = $row;
            }

            $resultados = reprocessarItensCompra($data['itens_reprocessados'], $itensOriginais, $idEmpresa, $conn);

            $conn->commit();
            
            ob_clean();
            echo json_encode([
                "success" => true, 
                "message" => "Compra reprocessada com sucesso!",
                "data" => $resultados
            ]);

        } catch (Exception $e) {
            $conn->rollback();
            ob_clean();
            echo json_encode([
                "success" => false, 
                "message" => "Erro ao reprocessar compra: " . $e->getMessage()
            ]);
        }
        break;

    // ════════════════════════════════════════════════════════
    //  DELETE — Excluir compra (opcional)
    // ════════════════════════════════════════════════════════
    case 'DELETE':
        parse_str($_SERVER['QUERY_STRING'], $params);
        $compraId = intval($params['id'] ?? 0);
        
        if ($compraId === 0) {
            ob_clean();
            echo json_encode(["success" => false, "message" => "ID da compra não especificado."]);
            exit;
        }

        $conn->begin_transaction();
        
        try {
            // Remove os itens primeiro
            $conn->query("DELETE FROM itens_compra WHERE id_compra = $compraId");
            // Remove a compra
            $conn->query("DELETE FROM compras WHERE id = $compraId AND id_empresa = $idEmpresa");
            
            $conn->commit();
            
            ob_clean();
            echo json_encode([
                "success" => true, 
                "message" => "Compra excluída com sucesso!"
            ]);
            
        } catch (Exception $e) {
            $conn->rollback();
            ob_clean();
            echo json_encode([
                "success" => false, 
                "message" => "Erro ao excluir compra: " . $e->getMessage()
            ]);
        }
        break;

    default:
        ob_clean();
        echo json_encode(["success" => false, "message" => "Método não permitido."]);
        break;
}

// ════════════════════════════════════════════════════════════
//  FUNÇÕES AUXILIARES
// ════════════════════════════════════════════════════════════

/**
 * Cadastra ou retorna o ID de um fornecedor existente
 */
function cadastrarOuAtualizarFornecedor($fornecedor, $idEmpresa, $conn) {
    $cnpj = $conn->real_escape_string($fornecedor['cnpj']);
    $checkSql = "SELECT id FROM fornecedores WHERE cnpj = '$cnpj' AND id_empresa = $idEmpresa";
    $result = $conn->query($checkSql);
    
    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        return $row['id'];
    }
    
    $razaoSocial = $conn->real_escape_string($fornecedor['razao_social']);
    $nomeFantasia = $conn->real_escape_string($fornecedor['nome_fantasia'] ?? '');
    $inscricaoEstadual = $conn->real_escape_string($fornecedor['inscricao_estadual'] ?? '');
    $telefone = $conn->real_escape_string($fornecedor['telefone'] ?? '');
    $email = $conn->real_escape_string($fornecedor['email'] ?? '');
    
    $endereco = [
        'cep' => $fornecedor['cep'] ?? '',
        'logradouro' => $fornecedor['logradouro'] ?? '',
        'numero' => $fornecedor['numero'] ?? '',
        'bairro' => $fornecedor['bairro'] ?? '',
        'cidade' => $fornecedor['cidade'] ?? '',
        'uf' => $fornecedor['uf'] ?? ''
    ];
    $enderecoJson = $conn->real_escape_string(json_encode($endereco));

    $sql = "INSERT INTO fornecedores (id_empresa, cnpj, razao_social, nome_fantasia, inscricao_estadual, telefone, email, endereco)
            VALUES ('$idEmpresa', '$cnpj', '$razaoSocial', '$nomeFantasia', '$inscricaoEstadual', '$telefone', '$email', '$enderecoJson')";

    if ($conn->query($sql)) {
        return $conn->insert_id;
    } else {
        throw new Exception("Erro ao cadastrar fornecedor: " . $conn->error);
    }
}

/**
 * Cadastra uma nova compra no banco
 */
function cadastrarCompra($dadosNota, $fornecedorId, $idEmpresa, $conn) {
    $numeroNota = $conn->real_escape_string($dadosNota['numero']);
    $serieNota = $conn->real_escape_string($dadosNota['serie'] ?? '');
    $chaveAcesso = $conn->real_escape_string($dadosNota['chave_acesso'] ?? '');
    $dataEmissao = $conn->real_escape_string($dadosNota['data_emissao']);
    $valorTotal = floatval($dadosNota['valor_total']);
    
    // Verifica se a nota já foi importada (evita duplicidade)
    if (!empty($chaveAcesso)) {
        $checkSql = "SELECT id FROM compras WHERE chave_acesso = '$chaveAcesso' AND id_empresa = $idEmpresa";
        $result = $conn->query($checkSql);
        if ($result->num_rows > 0) {
            $row = $result->fetch_assoc();
            return $row['id'];
        }
    }

    $sql = "INSERT INTO compras (id_empresa, id_fornecedor, numero_nota, serie_nota, chave_acesso, data_emissao, valor_total, status)
            VALUES ('$idEmpresa', '$fornecedorId', '$numeroNota', '$serieNota', '$chaveAcesso', '$dataEmissao', '$valorTotal', 'PENDENTE')";

    if ($conn->query($sql)) {
        return $conn->insert_id;
    } else {
        throw new Exception("Erro ao cadastrar compra: " . $conn->error);
    }
}

/**
 * Processa os itens da compra (XML importado) - APENAS VINCULA E CADASTRA, SEM ALTERAR ESTOQUE
 */
function processarItensCompra($itens, $compraId, $idEmpresa, $conn) {
    $produtosNovos = 0;
    $produtosAtualizados = 0;

    foreach ($itens as $item) {
        $produtoId = null;
        $ean = $conn->real_escape_string($item['ean'] ?? '');
        
        // Tenta encontrar produto existente pelo EAN
        if (!empty($ean)) {
            $checkSql = "SELECT id FROM produtos WHERE referencia = '$ean' AND id_empresa = $idEmpresa";
            $result = $conn->query($checkSql);
            if ($result->num_rows > 0) {
                $row = $result->fetch_assoc();
                $produtoId = $row['id'];
                $produtosAtualizados++;
                // NÃO ATUALIZA ESTOQUE AQUI MAIS
            }
        }

        // Se não encontrou, cadastra novo produto (com estoque 0 inicial)
        if (!$produtoId) {
            $produtoId = cadastrarNovoProduto($item, $idEmpresa, $conn);
            $produtosNovos++;
        }

        // Cadastra o item da compra
        cadastrarItemCompra($item, $compraId, $produtoId, $conn);
    }

    return ['novos' => $produtosNovos, 'atualizados' => $produtosAtualizados];
}

/**
 * Cadastra um novo produto no banco (ESTOQUE INICIAL ZERO)
 */
function cadastrarNovoProduto($item, $idEmpresa, $conn) {
    $referencia = $conn->real_escape_string($item['ean'] ?? '');
    $nome = $conn->real_escape_string($item['nome']);
    $unidadeVenda = $conn->real_escape_string($item['unidade_venda'] ?? 'UN');
    $ncm = $conn->real_escape_string($item['ncm'] ?? '');
    $cest = $conn->real_escape_string($item['cest'] ?? '');
    $cfop = $conn->real_escape_string($item['cfop'] ?? '');
    $origem = $conn->real_escape_string($item['origem'] ?? '0');
    
    $precoCusto = floatval($item['preco_custo_final']);
    $margem = floatval($item['margem'] ?? 0);
    $precoVenda = floatval($item['preco_venda'] ?? $precoCusto * (1 + ($margem / 100)));

    $sql = "INSERT INTO produtos (
        id_empresa, referencia, nome, unidade_venda, descricao, estoque, 
        preco_custo, margem, preco_venda, ncm, cest, cfop, origem
    ) VALUES (
        '$idEmpresa', '$referencia', '$nome', '$unidadeVenda', 'Importado via XML - NCM: $ncm',
        0, '$precoCusto', '$margem', '$precoVenda', '$ncm', '$cest', '$cfop', '$origem'
    )";

    if ($conn->query($sql)) {
        return $conn->insert_id;
    } else {
        throw new Exception("Erro ao cadastrar produto: " . $conn->error);
    }
}

/**
 * Cadastra um item na tabela itens_compra
 */
function cadastrarItemCompra($item, $compraId, $produtoId, $conn) {
    $codigoFornecedor = $conn->real_escape_string($item['codigo_fornecedor'] ?? '');
    $descricao = $conn->real_escape_string($item['nome']);
    $ncm = $conn->real_escape_string($item['ncm'] ?? '');
    $cfop = $conn->real_escape_string($item['cfop'] ?? '');
    $cest = $conn->real_escape_string($item['cest'] ?? '');
    $unidadeComercial = $conn->real_escape_string($item['unidade_comercial'] ?? '');
    $quantidadeComercial = floatval($item['quantidade_xml']);
    $valorUnitario = floatval($item['preco_custo_xml']);
    $valorTotal = floatval($item['valor_total_xml']);

    $sql = "INSERT INTO itens_compra (
        id_compra, id_produto, codigo_fornecedor, descricao, ncm, cfop, cest,
        unidade_comercial, quantidade_comercial, valor_unitario, valor_total
    ) VALUES (
        '$compraId', '$produtoId', '$codigoFornecedor', '$descricao', '$ncm', '$cfop', '$cest',
        '$unidadeComercial', '$quantidadeComercial', '$valorUnitario', '$valorTotal'
    )";

    if (!$conn->query($sql)) {
        throw new Exception("Erro ao cadastrar item da compra: " . $conn->error);
    }
}

/**
 * Reprocessa itens de uma compra existente
 */
function reprocessarItensCompra($itensReprocessados, $itensOriginais, $idEmpresa, $conn) {
    $produtosAtualizados = 0;
    $estoquesAjustados = 0;
    $precosAtualizados = 0;

    foreach ($itensReprocessados as $item) {
        $produtoId = intval($item['produto_id']);
        $itemOriginal = $itensOriginais[$produtoId] ?? null;
        
        if (!$itemOriginal) { continue; }

        $quantidadeOriginal = floatval($itemOriginal['quantidade_comercial']);
        $quantidadeNova = floatval($item['quantidade_final']);
        $diferencaEstoque = $quantidadeNova - $quantidadeOriginal;

        if ($diferencaEstoque != 0) {
            $updateEstoqueSql = "UPDATE produtos SET estoque = estoque + $diferencaEstoque WHERE id = $produtoId";
            if ($conn->query($updateEstoqueSql)) {
                $estoquesAjustados++;
            }
        }

        if (isset($item['preco_custo']) && floatval($item['preco_custo']) > 0) {
            $novoPrecoCusto = floatval($item['preco_custo']);
            $novaMargem = isset($item['margem']) ? floatval($item['margem']) : null;
            $novoPrecoVenda = isset($item['preco_venda']) ? floatval($item['preco_venda']) : null;
            
            if (!$novoPrecoVenda && $novaMargem !== null) {
                $novoPrecoVenda = $novoPrecoCusto * (1 + ($novaMargem / 100));
            }
            
            if ($novaMargem !== null && $novoPrecoVenda !== null) {
                $updatePrecoSql = "UPDATE produtos SET 
                    preco_custo = $novoPrecoCusto,
                    margem = $novaMargem,
                    preco_venda = $novoPrecoVenda
                    WHERE id = $produtoId";
            } elseif ($novaMargem !== null) {
                $updatePrecoSql = "UPDATE produtos SET 
                    preco_custo = $novoPrecoCusto,
                    margem = $novaMargem
                    WHERE id = $produtoId";
            } else {
                $updatePrecoSql = "UPDATE produtos SET 
                    preco_custo = $novoPrecoCusto
                    WHERE id = $produtoId";
            }
            
            if ($conn->query($updatePrecoSql)) {
                $precosAtualizados++;
            }
        }

        $produtosAtualizados++;
    }

    return [
        'produtos_atualizados' => $produtosAtualizados,
        'estoques_ajustados' => $estoquesAjustados,
        'precos_atualizados' => $precosAtualizados
    ];
}