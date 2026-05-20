<?php
// api/produtos.php — Versão atualizada com suporte ao app mobile
// ADICIONE no case 'GET' existente, antes do SELECT principal:

/*
  PATCH: Adicionar busca por código de barras/referência para o mobile

  Substitua o case 'GET' existente por este ou integre o trecho abaixo:
*/

// Trecho a ser integrado no seu produtos.php existente:
// -------------------------------------------------------

// Busca por código de barras ou referência (mobile)
if (isset($_GET['barcode'])) {
    $barcode = $conn->real_escape_string($_GET['barcode']);
    $sql = "SELECT * FROM produtos
            WHERE id_empresa = $idEmpresa
            AND (referencia = '$barcode' OR id = '$barcode')
            LIMIT 1";
    $res = $conn->query($sql);
    if ($res && $res->num_rows > 0) {
        ob_clean();
        echo json_encode($res->fetch_assoc());
    } else {
        ob_clean();
        echo json_encode(null);
    }
    exit;
}

// Busca por nome ou referência (mobile autocomplete)
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

// Listagem normal
$sql = "SELECT * FROM produtos WHERE id_empresa = $idEmpresa ORDER BY nome ASC";
$res = $conn->query($sql);
$prods = [];
while ($row = $res->fetch_assoc()) { $prods[] = $row; }
ob_clean();
echo json_encode($prods);
