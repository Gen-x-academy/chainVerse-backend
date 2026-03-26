<?php

namespace App\Tests;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class SymphonyTest extends AbstractApiTest
{
    private static $testSymphony = [
        'name' => 'No 1',
        'description' => null,
        'finishedAt' => null,
    ];

    /**
     * @depends testCreate
     */
    public function testIndex(): void
    {
        $response = $this->get('/symphony');
        $this->assertSame(200, $response->getStatusCode());
        $this->assertJson($response->getContent());

        $json = json_decode($response->getContent(), true);
        // $this->assertTrue(in_array(static::$testSymphony, $json));
    }

    public function testCreate(): void
    {
        $composer = [
            'firstName' => 'Foo',
            'lastName' => 'Bar',
            'dateOfBirth' => date('Y-m-d'),
            'countryCode' => 'DE',
        ];
        $response = $this->post('/composer', $composer);
        $this->assertSame(201, $response->getStatusCode());
        $this->assertJson($response->getContent());
        $composerJson = json_decode($response->getContent(), true);

        static::$testSymphony['composerId'] = $composerJson['id'];

        $response = $this->post('/symphony', static::$testSymphony);
        $this->assertSame(201, $response->getStatusCode());
        $this->assertJson($response->getContent());
        $json = json_decode($response->getContent(), true);
        $this->assertNotEmpty($json['id']);
        $this->assertNotEmpty($json['createdAt']);
        static::$testSymphony['id'] = $json['id'];
        static::$testSymphony['createdAt'] = $json['createdAt'];
    }

    /**
     * @depends testCreate
     */
    public function testShow(): void
    {
        $response = $this->get('/symphony/' . static::$testSymphony['id']);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertJson($response->getContent());

        $json = json_decode($response->getContent(), true);
        //$this->assertEquals(static::$testSymphony, $json);
    }

    /**
     * @depends testCreate
     */
    public function testUpdate(): void
    {
        static::$testSymphony['description'] = 'Foo bar long text description';
        $response = $this->put('/symphony/' . static::$testSymphony['id'], static::$testSymphony);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertJson($response->getContent());

        $json = json_decode($response->getContent(), true);
        //$this->assertEquals(static::$testSymphony, $json);
    }

    /**
     * @depends testCreate
     */
    public function testDelete(): void
    {
        $response = $this->delete('/symphony/' . static::$testSymphony['id']);
        $this->assertSame(204, $response->getStatusCode());
    }
}
