<?php

namespace Domain\Value\Logic\Formula;

/**
 * 論理包含(A => B)
 * 
 * $fml = new ImpFormula($fml1, $fml2);
 * $fml1Arg = [];
 * $fml2Arg = [];
 * $fml($fml1Arg, $fml2Arg);
 */
class ImpFormula extends BinaryOperation
{
    /**
     * 論理包含
     *
     * @param boolean $result1
     * @param boolean $result2
     * @return boolean
     */
    protected function judge(bool $result1, bool $result2) : bool
    {
        return !$result1 || $result2;
    }
}
