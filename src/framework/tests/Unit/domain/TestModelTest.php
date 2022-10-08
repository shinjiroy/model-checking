<?php

namespace Tests\Unit\domain;

use domain\TestModel;
use PHPUnit\Framework\TestCase;

class TestModelTest extends TestCase
{
    public function test_constructor()
    {
        new TestModel;
        $this->assertTrue(true);
    }
}
