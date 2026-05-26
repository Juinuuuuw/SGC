<?php
$host = "localhost";
$usuario = "root";
$senha = "";
$banco = "sgc_db"; // Confirme se este é o nome exato do seu banco de dados

$conn = new mysqli($host, $usuario, $senha, $banco);

if ($conn->connect_error) {
    die(json_encode(["success" => false, "message" => "Erro na conexão: " . $conn->connect_error]));
}

// Força o padrão UTF-8 para evitar problemas de acentuação na App
$conn->set_charset("utf8mb4");
?>