<?php

namespace App\Tests;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class ComposerTest extends AbstractApiTest
{
    private static $composerDetail = [

        'firstName' => 'Hassan',
        'lastName' => 'Oladipupo',
        'dateOfBirth' => '1998-01-27',
        'countryCode' => 'AT',
    ];


    /**
     * @depends testCreate
     */
    public function testIndex(): void
    {
        $response = $this->get('/composer');

        $this->assertSame(200,  $response->getStatusCode());


        $this->assertJson($response->getContent());

        $json = json_decode($response->getContent(), true);
        // var_dump($json);
        // var_dump(static::$composerDetail);

        // $this->assertTrue(in_array(static::$composerDetail, $json));
    }

    public function testCreate(): void
    {


        $invalidComposer = static::$composerDetail;
        unset($invalidComposer['lastName']);
        $response = $this->post('/composer', $invalidComposer);
        $this->assertSame(422, $response->getStatusCode());



        $response = $this->post('/composer', static::$composerDetail);


        $this->assertSame(201,  $response->getStatusCode());

        $this->assertJson($response->getContent());

        $json = json_decode($response->getContent(), true);

        $this->assertNotEmpty($json['id']);

        static::$composerDetail['id'] = $json['id'];
    }





    /**
     * @depends testCreate
     */
    public function testShow(): void
    {
        $response = $this->get('/composer/'  . static::$composerDetail['id']);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertJson($response->getContent());

        $json = json_decode($response->getContent(), true);
        //var_dump($json);

        // $this->assertEquals(static::$composerDetail, $json);
    }

    /**
     * @depends testCreate
     */
    public function testUpdate(): void
    {
        static::$composerDetail['firstName'] = 'Wolfgang Amadeus';
        $response = $this->put('/composer/' . static::$composerDetail['id'], static::$composerDetail);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertJson($response->getContent());

        $json = json_decode($response->getContent(), true);

        // $this->assertEquals(static::$composerDetail, $json);
    }

    /**
     * @depends testCreate
     */
    public function testDelete(): void
    {
        $response = $this->delete('/composer/' . static::$composerDetail['id']);
        $this->assertSame(204, $response->getStatusCode());
    }
}
