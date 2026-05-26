<?php
session_start();

$isApi = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;

$_SESSION = array();
session_destroy();

if ($isApi) {
    header("Content-Type: application/json; charset=UTF-8");
    header("Access-Control-Allow-Origin: *");
    echo json_encode(["success" => true, "message" => "Sessão terminada com sucesso."]);
} else {
    header("Location: ../login.html?sucesso=Saiu do sistema com segurança.");
}
exit;
?>