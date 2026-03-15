<?php

namespace App\Tests;

use Symfony\Component\HttpFoundation\Response;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;


abstract class AbstractApiTest extends WebTestCase
{
    protected KernelBrowser $client;
    protected function setUp(): void
    {
        $this->client = static::createClient();
    }

    protected function get(string $uri): Response
    {
        $this->client->request('GET', $uri, [], [], [
            'HTTP_ACCEPT' => 'application/json',
        ]);

        return $this->client->getResponse();
    }


    protected function post(string $uri, array $data): Response
    {
        $this->client->request('POST', $uri, [], [], [
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',

        ], json_encode($data));

        return $this->client->getResponse();
    }

    protected function put(string $uri, array $data): Response
    {
        $this->client->request('PUT', $uri, [], [], [
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',

        ], json_encode($data));

        return $this->client->getResponse();
    }

    protected function delete(string $uri): Response
    {
        $this->client->request('DELETE', $uri, [], [], [
            'HTTP_ACCEPT' => 'application/json',
        ]);

        return $this->client->getResponse();
    }
}
